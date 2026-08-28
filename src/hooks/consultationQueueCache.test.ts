import { describe, it, expect } from "vitest";
import {
  readQueueCache,
  writeQueueCache,
  buildInitialRows,
  decideAfterFetch,
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
