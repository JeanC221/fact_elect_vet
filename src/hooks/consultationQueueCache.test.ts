import { describe, it, expect } from "vitest";
import {
  readQueueCache,
  writeQueueCache,
  buildInitialRows,
  decideAfterFetch,
  readLastPollAt,
  markPolled,
  shouldPollNow,
} from "./consultationQueueCache";
import type { ConsultationQueueRow } from "@/mappers/consultationQueue";

/** Minimal Storage shim backed by a Map for node-environment tests. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  } as Storage;
}

const row = (over: Partial<ConsultationQueueRow> = {}): ConsultationQueueRow => ({
  id: "CON-001",
  clientId: "CLI-001",
  clientName: "María García",
  clientDoc: "CC 1234567890",
  identificationType: "CC",
  identificationNumber: "1234567890",
  email: "maria.garcia@email.com",
  phone: "3105550101",
  items: [],
  patientName: "Max",
  total: 95200,
  paymentMethod: "Tarjeta Crédito",
  provetStatus: "closed",
  invoiceStatus: "Draft",
  createdAt: new Date("2026-08-15T09:30:00.000Z"),
  ...over,
});

describe("readQueueCache / writeQueueCache", () => {
  it("returns null when the cache key is absent", () => {
    expect(readQueueCache(fakeStorage())).toBeNull();
  });

  it("round-trips rows and rehydrates createdAt as a Date", () => {
    const s = fakeStorage();
    const rows = [row({ id: "CON-1" }), row({ id: "CON-2", invoiceStatus: "Accepted" })];
    writeQueueCache(rows, s);
    const out = readQueueCache(s);
    expect(out).toHaveLength(2);
    expect(out?.[0].id).toBe("CON-1");
    expect(out?.[1].invoiceStatus).toBe("Accepted");
    expect(out?.[0].createdAt).toBeInstanceOf(Date);
    expect(out?.[0].createdAt.toISOString()).toBe("2026-08-15T09:30:00.000Z");
  });

  it("returns null on corrupt JSON", () => {
    const s = fakeStorage();
    s.setItem("fact_vet.consultationQueue", "{not json");
    expect(readQueueCache(s)).toBeNull();
  });

  it("returns null when the parsed value is not an array", () => {
    const s = fakeStorage();
    s.setItem("fact_vet.consultationQueue", JSON.stringify({ rows: [] }));
    expect(readQueueCache(s)).toBeNull();
  });
});

describe("buildInitialRows", () => {
  it("returns cached rows when present", () => {
    const cached = [row({ id: "CON-1" })];
    expect(buildInitialRows(cached)).toBe(cached);
  });

  it("returns an empty array (not mocks) when cache is null/empty", () => {
    expect(buildInitialRows(null)).toEqual([]);
    expect(buildInitialRows([])).toEqual([]);
  });
});

describe("decideAfterFetch", () => {
  const mockRows = [row({ id: "MOCK-1" })];

  it("merges live rows into prev preserving emitted DIAN badges", () => {
    const prev = [row({ id: "CON-1", invoiceStatus: "Accepted" })];
    const live = [row({ id: "CON-1" })]; // fresh, default Draft
    const out = decideAfterFetch(live, prev, false, mockRows);
    expect(out).toHaveLength(1);
    expect(out[0].invoiceStatus).toBe("Accepted");
  });

  it("returns empty on success with no live rows (not an error)", () => {
    expect(decideAfterFetch([], [], false, mockRows)).toEqual([]);
  });

  it("seeds mocks on network error when prev is empty", () => {
    const out = decideAfterFetch([], [], true, mockRows);
    expect(out).toBe(mockRows);
  });

  it("keeps prev rows on network error when prev is non-empty", () => {
    const prev = [row({ id: "CON-1", invoiceStatus: "Accepted" })];
    const out = decideAfterFetch([], prev, true, mockRows);
    expect(out).toBe(prev);
  });

  it("drops prev rows absent from a successful live payload", () => {
    const prev = [row({ id: "OLD-1", invoiceStatus: "Accepted" })];
    const live = [row({ id: "NEW-1" })];
    const out = decideAfterFetch(live, prev, false, mockRows);
    expect(out.map((r) => r.id)).toEqual(["NEW-1"]);
  });
});
describe("cross-tab poll throttle", () => {
  const MIN = 20_000;

  it("allows the very first poll when no stamp exists", () => {
    expect(readLastPollAt(fakeStorage())).toBeNull();
    expect(shouldPollNow(null, 1_000_000, MIN)).toBe(true);
  });

  it("blocks a second poll fired inside the interval (interval + focus + visibilitychange on one device)", () => {
    const store = fakeStorage();
    markPolled(1_000_000, store);
    expect(readLastPollAt(store)).toBe(1_000_000);
    // focus fires 5ms later, then visibilitychange 6ms later: both suppressed.
    expect(shouldPollNow(readLastPollAt(store), 1_000_005, MIN)).toBe(false);
    expect(shouldPollNow(readLastPollAt(store), 1_000_006, MIN)).toBe(false);
  });

  it("allows a poll again once the interval has elapsed", () => {
    const store = fakeStorage();
    markPolled(1_000_000, store);
    expect(shouldPollNow(readLastPollAt(store), 1_000_000 + MIN - 1, MIN)).toBe(false);
    expect(shouldPollNow(readLastPollAt(store), 1_000_000 + MIN, MIN)).toBe(true);
  });

  it("shares the stamp across tabs on the same device (localStorage, not per-tab sessionStorage)", () => {
    const sharedDevice = fakeStorage();
    // Tab A claims the slot.
    expect(shouldPollNow(readLastPollAt(sharedDevice), 500_000, MIN)).toBe(true);
    markPolled(500_000, sharedDevice);
    // Tab B, reading the same localStorage, backs off instead of duplicating
    // 6 more Provet calls.
    expect(shouldPollNow(readLastPollAt(sharedDevice), 500_100, MIN)).toBe(false);
  });

  it("fails OPEN on a corrupt stamp — a bad value must never wedge the queue into never refreshing", () => {
    const store = fakeStorage();
    store.setItem("fact_vet.lastQueuePoll", "no-soy-un-numero");
    expect(readLastPollAt(store)).toBeNull();
    expect(shouldPollNow(null, 1_000_000, MIN)).toBe(true);
  });

  it("fails OPEN on a future-dated stamp (clock skew)", () => {
    expect(shouldPollNow(9_999_999_999, 1_000_000, MIN)).toBe(true);
  });

  it("returns null and no-ops when storage is unavailable (privacy mode)", () => {
    expect(readLastPollAt(null)).toBeNull();
    expect(() => markPolled(1_000, null)).not.toThrow();
  });
});
