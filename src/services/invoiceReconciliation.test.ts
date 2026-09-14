import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildEmissionMarker,
  buildObservations,
  findInvoiceByMarker,
  AmbiguousReconciliationError,
  ReconciliationTruncatedError,
} from "./invoiceReconciliation";
import { SiigoApiError } from "./siigoApi";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => fetchMock.mockReset());
afterEach(() => fetchMock.mockReset());

const res = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const listOf = (rows: { id: string; observations?: string | null; number?: number }[]) => ({
  results: rows,
  pagination: { total_results: rows.length },
});

describe("emission marker", () => {
  it("is scoped to the emission attempt, not just the consultation", () => {
    // After an annulment the same consultation is billed again. A marker built
    // only from the consultation id would match the OLD invoice and report a
    // false success.
    const first = buildObservations("19", "keyAAA");
    const second = buildObservations("19", "keyBBB");
    expect(first).not.toBe(second);
    expect(first).toContain("Consulta Provet #19");
    expect(buildEmissionMarker("keyAAA")).toBe("FEV:keyAAA");
  });

  it("keeps the consultation readable for clinic staff inside Siigo Nube", () => {
    expect(buildObservations("38", "k1")).toMatch(/^Consulta Provet #38 · FEV:k1$/);
  });
});

describe("findInvoiceByMarker", () => {
  it("returns the invoice whose observations carry the marker", async () => {
    fetchMock.mockResolvedValue(
      res(listOf([
        { id: "OTHER", observations: "Consulta Provet #1 · FEV:zzz" },
        { id: "MINE", number: 7, observations: "Consulta Provet #19 · FEV:abc" },
      ])),
    );
    await expect(findInvoiceByMarker("FEV:abc", "tok", "P1")).resolves.toEqual({ id: "MINE", number: 7 });
  });

  it("returns null when no document carries the marker — the retry is then safe", async () => {
    fetchMock.mockResolvedValue(res(listOf([{ id: "OTHER", observations: "FEV:zzz" }])));
    await expect(findInvoiceByMarker("FEV:abc", "tok", "P1")).resolves.toBeNull();
  });

  it("tolerates documents with null or missing observations", async () => {
    fetchMock.mockResolvedValue(res(listOf([{ id: "A", observations: null }, { id: "B" }])));
    await expect(findInvoiceByMarker("FEV:abc", "tok", "P1")).resolves.toBeNull();
  });

  it("THROWS when the marker matches more than one document instead of picking one", async () => {
    fetchMock.mockResolvedValue(
      res(listOf([{ id: "A", observations: "FEV:abc" }, { id: "B", observations: "FEV:abc" }])),
    );
    await expect(findInvoiceByMarker("FEV:abc", "tok", "P1")).rejects.toBeInstanceOf(AmbiguousReconciliationError);
  });

  it("searches from YESTERDAY, so an emission near midnight is not missed", async () => {
    fetchMock.mockResolvedValue(res(listOf([])));
    await findInvoiceByMarker("FEV:abc", "tok", "P1");
    const url = fetchMock.mock.calls[0][0] as string;
    const start = /created_start=(\d{4}-\d{2}-\d{2})/.exec(url)![1];
    const end = /created_end=(\d{4}-\d{2}-\d{2})/.exec(url)![1];
    expect(new Date(start).getTime()).toBeLessThan(new Date(end).getTime());
  });

  it("C-4: created_end extends to TOMORROW, not today — Siigo treats a date with no time as T00:00:00 and 'created_end=today' silently excludes everything created today after midnight (API_SIIGO_REFERENCIA_COMPLETA.md, Trampa de fechas sin hora)", async () => {
    fetchMock.mockResolvedValue(res(listOf([])));
    await findInvoiceByMarker("FEV:abc", "tok", "P1");
    const url = fetchMock.mock.calls[0][0] as string;
    const end = /created_end=(\d{4}-\d{2}-\d{2})/.exec(url)![1];
    const todayCOT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    const tomorrowCOT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(Date.now() + 86_400_000));
    expect(end).not.toBe(todayCOT);
    expect(end).toBe(tomorrowCOT);
  });

  it("pages until a short page, so a match on page 2 is still found", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: `P1-${i}`, observations: "FEV:zzz" }));
    fetchMock
      .mockResolvedValueOnce(res(listOf(full)))
      .mockResolvedValueOnce(res(listOf([{ id: "HIT", observations: "FEV:abc" }])));
    await expect(findInvoiceByMarker("FEV:abc", "tok", "P1")).resolves.toMatchObject({ id: "HIT" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("THROWS rather than returning null when the lookup itself fails — a failed check is not evidence of absence", async () => {
    fetchMock.mockResolvedValue(res({ error: "boom" }, 503));
    await expect(findInvoiceByMarker("FEV:abc", "tok", "P1")).rejects.toBeInstanceOf(SiigoApiError);
  });

  it("THROWS on a network failure during the lookup", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(findInvoiceByMarker("FEV:abc", "tok", "P1")).rejects.toMatchObject({ code: "service_unavailable" });
  });

  it("C-7: THROWS instead of returning null when the search is truncated at MAX_RECONCILE_PAGES with the marker not yet found — 'I stopped looking' must not be reported as 'it does not exist'", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: `P-${i}`, observations: "FEV:zzz" }));
    fetchMock.mockResolvedValue(res(listOf(fullPage))); // every one of the 5 pages comes back full, marker never seen
    await expect(findInvoiceByMarker("FEV:abc", "tok", "P1")).rejects.toBeInstanceOf(ReconciliationTruncatedError);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("C-7: does NOT throw when the marker is found within the truncated window — a confirmed hit is a confirmed hit", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: `P-${i}`, observations: "FEV:zzz" }));
    const pageWithHit = [{ id: "HIT", observations: "FEV:abc" }, ...fullPage.slice(1)];
    // 5 full pages (all reach MAX_RECONCILE_PAGES, the last one still full),
    // but the marker sits on page 3 — existence is already confirmed there.
    fetchMock
      .mockResolvedValueOnce(res(listOf(fullPage)))
      .mockResolvedValueOnce(res(listOf(fullPage)))
      .mockResolvedValueOnce(res(listOf(pageWithHit)))
      .mockResolvedValueOnce(res(listOf(fullPage)))
      .mockResolvedValueOnce(res(listOf(fullPage)));
    await expect(findInvoiceByMarker("FEV:abc", "tok", "P1")).resolves.toMatchObject({ id: "HIT" });
  });

  it("sends the Siigo auth headers", async () => {
    fetchMock.mockResolvedValue(res(listOf([])));
    await findInvoiceByMarker("FEV:abc", "tok-123", "PARTNER");
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers["Partner-Id"]).toBe("PARTNER");
    expect(init.headers.Authorization).toBe("Bearer tok-123");
  });
});
