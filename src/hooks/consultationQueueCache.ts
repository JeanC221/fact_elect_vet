import type { ConsultationQueueRow } from "@/mappers/consultationQueue";
import { mergeQueueRows } from "@/mappers/provetToQueue";

/**
 * Client-side persistence + fallback decision for the live Provet queue.
 * All helpers are pure / side-effect-isolated (the Storage is injected or
 * lazily resolved) so the fallback logic is unit-testable in the node Vitest
 * environment — the React useEffect/useState glue lives in useConsultationQueue.
 *
 * sessionStorage (not localStorage) is used: the live queue is ephemeral per
 * working tab — a fresh tab always re-fetches instead of showing stale rows —
 * while still surviving / <-> /settings client navigation and same-tab reloads.
 */
const CACHE_KEY = "fact_vet.consultationQueue";

/** SSR-safe access to the browser sessionStorage (null when unavailable). */
function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null; // Privacy mode / disabled storage
  }
}

/** JSON reviver: rehydrate the row `createdAt` ISO string back into a Date. */
function rowReviver(key: string, value: unknown): unknown {
  if (key === "createdAt" && typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d;
  }
  return value;
}

/** Read & parse the cached queue; null on miss, corrupt JSON, or no storage. */
export function readQueueCache(storage?: Storage | null): ConsultationQueueRow[] | null {
  const store = storage ?? getStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw, rowReviver) as unknown;
    return Array.isArray(parsed) ? (parsed as ConsultationQueueRow[]) : null;
  } catch {
    return null;
  }
}

/** Serialize & persist the queue snapshot; silently no-op if storage is missing. */
export function writeQueueCache(rows: ConsultationQueueRow[], storage?: Storage | null): void {
  const store = storage ?? getStorage();
  if (!store) return;
  try {
    store.setItem(CACHE_KEY, JSON.stringify(rows));
  } catch {
    // Quota exceeded / disabled storage → non-fatal, skip persisting.
  }
}

/**
 * Hydrate initial mount state: cached rows if present, otherwise empty (NOT
 * mocks) so the auto-fetch — not a static fallback — decides the first paint.
 */
export function buildInitialRows(cached: ConsultationQueueRow[] | null): ConsultationQueueRow[] {
  return cached && cached.length > 0 ? cached : [];
}

/**
 * Pure fallback decision (directive: only seed mocks on an explicit network
 * error). A network error = a thrown fetch OR a non-2xx HTTP status.
 * - success → merge fresh live rows into prev, preserving emitted DIAN badges.
 * - success with empty live rows → [] (genuinely no consultations, not error).
 * - network error + prev empty → seed mocks so the dashboard remains usable.
 * - network error + prev non-empty → keep prev (never wipe shown data).
 */
export function decideAfterFetch(
  liveRows: ConsultationQueueRow[],
  prevRows: ConsultationQueueRow[],
  isNetworkError: boolean,
  mockRows: ConsultationQueueRow[],
): ConsultationQueueRow[] {
  if (!isNetworkError) return mergeQueueRows(prevRows, liveRows);
  return prevRows.length > 0 ? prevRows : mockRows;
}

/**
 * Cross-tab poll throttle.
 *
 * Every `/api/consultations` GET fans out into 6 parallel Provet calls, so
 * each redundant poll costs 6 upstream requests, not 1. Three triggers can
 * fire almost simultaneously on one device: the 20s interval, `focus`, and
 * `visibilitychange` (the last two BOTH fire on a single tab switch), and each
 * open tab runs its own copy of all three.
 *
 * A shared timestamp in localStorage (localStorage, not the sessionStorage
 * used for the queue cache — sessionStorage is per-tab and would not
 * deduplicate anything) collapses all of that to at most one poll per interval
 * per device. This is deliberately NOT a leader election over BroadcastChannel:
 * a leader that dies leaves the remaining tabs polling nothing until reload,
 * whereas a stale timestamp simply expires and the next trigger polls.
 *
 * Scope note: this covers ONE device. Cross-device coordination is explicitly
 * not implemented — see the rationale in useConsultationQueue.ts.
 */
const POLL_STAMP_KEY = "fact_vet.lastQueuePoll";

/** SSR-safe access to localStorage (null when unavailable). */
function getSharedStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null; // Privacy mode / disabled storage
  }
}

/** Read the last poll timestamp (ms epoch), or null when absent/unreadable. */
export function readLastPollAt(storage?: Storage | null): number | null {
  const store = storage ?? getSharedStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(POLL_STAMP_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Claim the current poll slot. Call BEFORE fetching, so sibling tabs back off. */
export function markPolled(now: number, storage?: Storage | null): void {
  const store = storage ?? getSharedStorage();
  if (!store) return;
  try {
    store.setItem(POLL_STAMP_KEY, String(now));
  } catch {
    // Quota / disabled storage → fall back to unthrottled polling.
  }
}

/**
 * Pure throttle decision. Returns true when no poll has happened within
 * `minIntervalMs`. A missing, unreadable or future-dated stamp returns true:
 * a bad clock or a corrupt value must never permanently wedge the queue into
 * never refreshing — failing open is the safe direction here, since the cost
 * of an extra poll is a few requests while the cost of no poll is a stale
 * consultation list.
 */
export function shouldPollNow(
  lastPollAt: number | null,
  now: number,
  minIntervalMs: number,
): boolean {
  if (lastPollAt === null || !Number.isFinite(lastPollAt)) return true;
  if (lastPollAt > now) return true; // clock skew / bogus future stamp
  return now - lastPollAt >= minIntervalMs;
}
