"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsultationQueueRow, InvoiceStatus } from "@/mappers/consultationQueue";
import { buildConsultationQueue } from "@/mappers/consultationQueue";
import { mockClients, mockConsultations, mockPatients } from "@/mocks/provet";
import type { TranslatedError } from "@/services/errorTranslator";
import {
  buildInitialRows,
  decideAfterFetch,
  diagnoseEmptyQueue,
  type QueueMeta,
  markPolled,
  readLastPollAt,
  readQueueCache,
  shouldPollNow,
  writeQueueCache,
} from "./consultationQueueCache";

/** Static mock rows — the only fallback, seeded solely on a network error. */
const MOCK_ROWS: ConsultationQueueRow[] = buildConsultationQueue(
  mockConsultations,
  mockClients,
  mockPatients,
);

const FETCH_ERROR: TranslatedError = {
  code: "provet_refresh_failed",
  message:
    "No se pudieron consultar las atenciones en Provet. Mostrando datos de respaldo.",
  severity: "warning",
  quickAction: "none",
  retryable: false,
};

/**
 * Rate-limiting decision (Hallazgo A4) — cross-device coordination NOT built.
 *
 * Measured cost: each poll is 1 request against each of 6 SEPARATE Provet
 * endpoint budgets (limits are per-endpoint over a rolling 60s window), i.e.
 * 3/min per endpoint per device at the 20s interval. The real team is the
 * clinic owner plus receptionists — roughly 4 devices, so ~12/min per
 * endpoint. That is not a plausible threat to any per-endpoint budget, and
 * Provet returns 429 with a Retry-After header if it ever were.
 *
 * A distributed rate limiter (shared token bucket in Postgres, or a queue in
 * front of /api/consultations) would add a database round-trip to every poll,
 * a new failure mode on the critical path, and coordination code, to solve a
 * problem this deployment does not have. Explicitly rejected as
 * over-engineering for a team of this size.
 *
 * What IS implemented is same-device deduplication, because that waste is
 * real and free to remove: the interval, `focus` and `visibilitychange` all
 * fire on a single tab switch, every open tab runs its own copy, and a slow
 * request used to get a second one stacked on top of it. See the shared
 * timestamp throttle in consultationQueueCache.ts and the in-flight guard in
 * revalidate() below.
 *
 * Revisit if: the clinic adds many more devices, Provet starts returning 429,
 * or the page_size weight (see api/consultations/route.ts) turns out to be
 * high once production credentials confirm the per-endpoint defaults.
 */

/**
 * Poll interval, shared by the timer and the throttle so both agree on what
 * "too soon" means. Floor of 5s guards against a misconfigured env var.
 */
function resolvePollMs(): number {
  const configured = Number(process.env.NEXT_PUBLIC_QUEUE_POLL_MS);
  return Number.isFinite(configured) && configured >= 5_000 ? configured : 20_000;
}

export interface RefreshResult {
  ok: boolean;
  count: number;
}

export interface UseConsultationQueueResult {
  rows: ConsultationQueueRow[];
  isInitialLoading: boolean;
  isRefreshing: boolean;
  fetchError: TranslatedError | null;
  handleRefresh: () => Promise<RefreshResult>;
  setRowStatus: (id: string, status: InvoiceStatus) => void;
  clearFetchError: () => void;
}

export function useConsultationQueue(): UseConsultationQueueResult {
  const [rows, setRows] = useState<ConsultationQueueRow[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<TranslatedError | null>(null);
  const fetchedOnce = useRef(false);
  const inFlight = useRef(false);
  const rowsRef = useRef<ConsultationQueueRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const revalidate = useCallback(async (initial: boolean): Promise<RefreshResult> => {
    // A `/api/consultations` GET fans out into 6 parallel Provet calls and has
    // no client-side timeout. Without this guard the 20s timer stacks a second
    // request on top of a slow first one, doubling upstream load exactly when
    // Provet is already struggling.
    if (inFlight.current) return { ok: true, count: rowsRef.current.length };
    inFlight.current = true;
    if (initial) setIsInitialLoading(true);
    else setIsRefreshing(true);
    setFetchError(null);
    let isNetworkError = false;
    let liveRows: ConsultationQueueRow[] = [];
    let meta: QueueMeta | undefined;
    let serverMessage: string | null = null;
    try {
      try {
        const res = await fetch("/api/consultations", { cache: "no-store" });
        const data = (await res.json()) as {
          rows?: ConsultationQueueRow[];
          meta?: QueueMeta;
          error?: { message?: string };
        };
        if (res.ok && Array.isArray(data?.rows)) {
          liveRows = data.rows as ConsultationQueueRow[];
          meta = data.meta;
        }
        else {
          isNetworkError = true;
          serverMessage = data?.error?.message ?? null;
        }
      } catch {
        isNetworkError = true; // TypeError: offline / CORS / DNS
      }
      const next = decideAfterFetch(liveRows, rowsRef.current, isNetworkError, MOCK_ROWS);
      rowsRef.current = next;
      setRows(next);
      if (!isNetworkError) {
        writeQueueCache(next);
        // An empty list is ambiguous on screen; say which kind of empty it is.
        const notice = diagnoseEmptyQueue(next.length, meta);
        if (notice) {
          setFetchError({
            code: "empty_queue",
            message: notice.message,
            severity: notice.severity,
            quickAction: "none",
            retryable: false,
          });
        }
      } else setFetchError({ ...FETCH_ERROR, message: serverMessage ?? FETCH_ERROR.message });
      if (initial) setIsInitialLoading(false);
      else setIsRefreshing(false);
      return { ok: !isNetworkError, count: next.length };
    } finally {
      // MUST be a finally: a throw from decideAfterFetch/writeQueueCache would
      // otherwise leave the flag stuck at true and kill polling for the rest
      // of the session.
      inFlight.current = false;
    }
  }, []);

  /**
   * Automatic (non-user-initiated) refresh. Claims the shared cross-tab slot
   * BEFORE fetching so sibling tabs on the same device back off instead of
   * firing their own 6 Provet calls for the same data.
   */
  const maybeRevalidate = useCallback(async (initial: boolean): Promise<void> => {
    const now = Date.now();
    if (!shouldPollNow(readLastPollAt(), now, resolvePollMs())) return;
    markPolled(now);
    await revalidate(initial);
  }, [revalidate]);

  // Auto-fetch on mount: hydrate from cache (instant) then revalidate live.
  useEffect(() => {
    if (fetchedOnce.current) return; // guard React 18 StrictMode double-invoke
    fetchedOnce.current = true;
    const initial = buildInitialRows(readQueueCache());
    if (initial.length > 0) {
      rowsRef.current = initial;
      setRows(initial);
      setIsInitialLoading(false);
      void maybeRevalidate(false); // background refresh (cached data already shown)
    } else {
      void revalidate(true); // no cache → initial live load, never throttled
    }
  }, [revalidate, maybeRevalidate]);

  // The explicit "Refrescar" button bypasses the throttle: it is a deliberate
  // user action, and silently ignoring it would look like a broken button.
  const handleRefresh = useCallback(() => revalidate(false), [revalidate]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void maybeRevalidate(false);
    }, resolvePollMs());
    return () => clearInterval(interval);
  }, [maybeRevalidate]);

  useEffect(() => {
    // `focus` and `visibilitychange` BOTH fire on a single tab switch; the
    // throttle collapses them (and any interval tick landing in the same
    // window) into one poll.
    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") void maybeRevalidate(false);
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [maybeRevalidate]);

  const setRowStatus = useCallback((id: string, status: InvoiceStatus) => {
    const next = rowsRef.current.map((r) =>
      r.id === id ? { ...r, invoiceStatus: status } : r,
    );
    rowsRef.current = next;
    writeQueueCache(next);
    setRows(next);
  }, []);

  const clearFetchError = useCallback(() => setFetchError(null), []);

  return {
    rows,
    isInitialLoading,
    isRefreshing,
    fetchError,
    handleRefresh,
    setRowStatus,
    clearFetchError,
  };
}