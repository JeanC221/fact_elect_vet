import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findCreditNoteByInvoice, fetchCreditNoteDetail, reconcileCreditNote } from "./creditNoteReconciliation";
import { AmbiguousReconciliationError, ReconciliationTruncatedError } from "./invoiceReconciliation";
import { SiigoApiError } from "./siigoApi";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => fetchMock.mockReset());
afterEach(() => fetchMock.mockReset());

const res = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const listOf = (rows: { id: string; invoice?: { id: string } }[]) => ({
  results: rows,
  pagination: { total_results: rows.length },
});

describe("findCreditNoteByInvoice", () => {
  it("returns the credit note whose `invoice.id` matches, with NO marker needed", async () => {
    fetchMock.mockResolvedValue(
      res(listOf([
        { id: "OTHER-NC", invoice: { id: "OTHER-INV" } },
        { id: "MY-NC", invoice: { id: "MY-INV" } },
      ])),
    );
    await expect(findCreditNoteByInvoice("MY-INV", "tok", "P1")).resolves.toEqual({ id: "MY-NC" });
  });

  it("returns null when no credit note references this invoice — the retry is then safe", async () => {
    fetchMock.mockResolvedValue(res(listOf([{ id: "OTHER-NC", invoice: { id: "OTHER-INV" } }])));
    await expect(findCreditNoteByInvoice("MY-INV", "tok", "P1")).resolves.toBeNull();
  });

  it("tolerates credit notes with no `invoice` echoed at all", async () => {
    fetchMock.mockResolvedValue(res(listOf([{ id: "A" }])));
    await expect(findCreditNoteByInvoice("MY-INV", "tok", "P1")).resolves.toBeNull();
  });

  it("THROWS when more than one credit note references the same invoice — never guesses which", async () => {
    fetchMock.mockResolvedValue(
      res(listOf([{ id: "A", invoice: { id: "MY-INV" } }, { id: "B", invoice: { id: "MY-INV" } }])),
    );
    await expect(findCreditNoteByInvoice("MY-INV", "tok", "P1")).rejects.toBeInstanceOf(AmbiguousReconciliationError);
  });

  it("pages until a short page, so a match on page 2 is still found", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: `P1-${i}`, invoice: { id: "OTHER" } }));
    fetchMock
      .mockResolvedValueOnce(res(listOf(full)))
      .mockResolvedValueOnce(res(listOf([{ id: "HIT", invoice: { id: "MY-INV" } }])));
    await expect(findCreditNoteByInvoice("MY-INV", "tok", "P1")).resolves.toEqual({ id: "HIT" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("THROWS instead of returning null when the search is truncated with the invoice not yet found", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: `P-${i}`, invoice: { id: "OTHER" } }));
    fetchMock.mockResolvedValue(res(listOf(fullPage)));
    await expect(findCreditNoteByInvoice("MY-INV", "tok", "P1")).rejects.toBeInstanceOf(ReconciliationTruncatedError);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("THROWS rather than returning null when the lookup itself fails", async () => {
    fetchMock.mockResolvedValue(res({ error: "boom" }, 503));
    await expect(findCreditNoteByInvoice("MY-INV", "tok", "P1")).rejects.toBeInstanceOf(SiigoApiError);
  });

  it("THROWS on a network failure during the lookup", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(findCreditNoteByInvoice("MY-INV", "tok", "P1")).rejects.toMatchObject({ code: "service_unavailable" });
  });

  it("sends the Siigo auth headers", async () => {
    fetchMock.mockResolvedValue(res(listOf([])));
    await findCreditNoteByInvoice("MY-INV", "tok-123", "PARTNER");
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers["Partner-Id"]).toBe("PARTNER");
    expect(init.headers.Authorization).toBe("Bearer tok-123");
  });

  it("queries GET /v1/credit-notes, not /v1/invoices", async () => {
    fetchMock.mockResolvedValue(res(listOf([])));
    await findCreditNoteByInvoice("MY-INV", "tok", "P1");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/v1/credit-notes?");
  });
});

describe("fetchCreditNoteDetail", () => {
  it("parses a detail response with a populated stamp", async () => {
    fetchMock.mockResolvedValue(res({ id: "NC-1", stamp: { cufe: "C1", status: "Accepted" } }));
    const detail = await fetchCreditNoteDetail("NC-1", "tok", "P1");
    expect(detail.cufe).toBe("C1");
    expect(detail.status).toBe("Accepted");
  });

  it("THROWS on a non-ok response", async () => {
    fetchMock.mockResolvedValue(res({}, 404));
    await expect(fetchCreditNoteDetail("NC-1", "tok", "P1")).rejects.toBeInstanceOf(SiigoApiError);
  });
});

describe("reconcileCreditNote", () => {
  it("returns null without a detail fetch when nothing matches", async () => {
    fetchMock.mockResolvedValue(res(listOf([])));
    await expect(reconcileCreditNote("MY-INV", "tok", "P1")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // list only, no detail call
  });

  it("fetches full detail for a matched credit note", async () => {
    fetchMock
      .mockResolvedValueOnce(res(listOf([{ id: "NC-1", invoice: { id: "MY-INV" } }])))
      .mockResolvedValueOnce(res({ id: "NC-1", stamp: { cufe: "C1", status: "Accepted" } }));
    const result = await reconcileCreditNote("MY-INV", "tok", "P1");
    expect(result?.cufe).toBe("C1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
