"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsultationQueueRow, InvoiceStatus } from "@/mappers/consultationQueue";
import { buildConsultationQueue } from "@/mappers/consultationQueue";
import { mockClients, mockConsultations, mockPatients } from "@/mocks/provet";
import type { TranslatedError } from "@/services/errorTranslator";
import {
  buildInitialRows,
  decideAfterFetch,
  readQueueCache,
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

/**
 * Live Provet consultation queue with cross-navigation persistence.
 * Hydrates from sessionStorage on mount (so / <-> /settings navigation keeps
 * fetched rows), auto-fetches /api/consultations on mount, and only falls back
 * to static mock rows on an explicit network error. Loading flags keep action
 * buttons disabled during API calls to prevent UI lockups.
 */
export function useConsultationQueue(): UseConsultationQueueResult {
  const [rows, setRows] = useState<ConsultationQueueRow[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<TranslatedError | null>(null);
  const fetchedOnce = useRef(false);
  const rowsRef = useRef<ConsultationQueueRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const revalidate = useCallback(async (initial: boolean): Promise<RefreshResult> => {
    if (initial) setIsInitialLoading(true);
    else setIsRefreshing(true);
    setFetchError(null);
    let isNetworkError = false;
    let liveRows: ConsultationQueueRow[] = [];
    let serverMessage: string | null = null;
    try {
      const res = await fetch("/api/consultations", { cache: "no-store" });
      const data = (await res.json()) as {
        rows?: ConsultationQueueRow[];
        error?: { message?: string };
      };
      if (res.ok && Array.isArray(data?.rows)) liveRows = data.rows as ConsultationQueueRow[];
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
    if (!isNetworkError) writeQueueCache(next);
    else setFetchError({ ...FETCH_ERROR, message: serverMessage ?? FETCH_ERROR.message });
    if (initial) setIsInitialLoading(false);
    else setIsRefreshing(false);
    return { ok: !isNetworkError, count: next.length };
  }, []);

  // Auto-fetch on mount: hydrate from cache (instant) then revalidate live.
  useEffect(() => {
    if (fetchedOnce.current) return; // guard React 18 StrictMode double-invoke
    fetchedOnce.current = true;
    const initial = buildInitialRows(readQueueCache());
    if (initial.length > 0) {
      rowsRef.current = initial;
      setRows(initial);
      setIsInitialLoading(false);
      void revalidate(false); // background refresh (cached data already shown)
    } else {
      void revalidate(true); // no cache → initial live load (or mock fallback)
    }
  }, [revalidate]);

  const handleRefresh = useCallback(() => revalidate(false), [revalidate]);

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
