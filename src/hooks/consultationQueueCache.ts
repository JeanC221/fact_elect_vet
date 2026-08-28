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
