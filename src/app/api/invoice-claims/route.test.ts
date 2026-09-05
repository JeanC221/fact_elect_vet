import { describe, it, expect, vi, beforeEach } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@/services/db", () => ({ getPool: () => ({ query: queryMock }) }));

import { GET, DELETE } from "./route";

const CONSULTATION_ID = "provet-consult-777";

function deleteRequest(query: string): Request {
  return new Request(`http://localhost/api/invoice-claims${query}`, { method: "DELETE" });
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /api/invoice-claims", () => {
  it("lists only claims an admin can act on (never cleanly emitted ones)", async () => {
    queryMock.mockResolvedValue({
      rowCount: 2,
      rows: [
        { consultation_id: "c-1", status: "unknown", invoice_id: null, claimed_at: new Date("2026-09-01T10:00:00Z"), last_error: "Siigo no respondió en 120s." },
        { consultation_id: "c-2", status: "pending", invoice_id: null, claimed_at: new Date("2026-09-02T10:00:00Z"), last_error: null },
      ],
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.count).toBe(2);
    expect(json.claims.map((c: { consultationId: string }) => c.consultationId)).toEqual(["c-1", "c-2"]);
    expect(queryMock.mock.calls[0][0]).toContain("status <> 'emitted'");
  });

  it("returns 500 rather than an empty list when the database is unreachable — an empty list would read as 'nothing is blocked'", async () => {
    queryMock.mockRejectedValue(new Error("connection terminated"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("default");
  });
});

describe("DELETE /api/invoice-claims", () => {
  it("releases a stuck claim so the consultation can be billed again", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [{ consultation_id: CONSULTATION_ID }] });

    const res = await DELETE(deleteRequest(`?consultationId=${CONSULTATION_ID}`));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ released: true, consultationId: CONSULTATION_ID });
    expect(queryMock.mock.calls[0][0]).toContain("status <> 'emitted'");
  });

  it("REFUSES to release an already-emitted claim — that would allow a duplicate DIAN document", async () => {
    // The guarded DELETE matches nothing, then the follow-up read finds the row.
    queryMock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ consultation_id: CONSULTATION_ID, status: "emitted", invoice_id: "INV-1", claimed_at: new Date(), last_error: null }],
      });

    const res = await DELETE(deleteRequest(`?consultationId=${CONSULTATION_ID}`));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("claim_emitted");
    expect(json.error.message).toContain("nota crédito");
  });

  it("returns 404 when no claim exists for that consultation", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await DELETE(deleteRequest(`?consultationId=${CONSULTATION_ID}`));

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("claim_not_found");
  });

  it("returns 400 and touches the database when consultationId is missing", async () => {
    const res = await DELETE(deleteRequest(""));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_consultation_id");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a blank consultationId", async () => {
    const res = await DELETE(deleteRequest("?consultationId=%20%20"));

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an absurdly long consultationId instead of passing it to the query", async () => {
    const res = await DELETE(deleteRequest(`?consultationId=${"a".repeat(300)}`));

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the database fails, never a false 'released'", async () => {
    queryMock.mockRejectedValue(new Error("connection terminated"));

    const res = await DELETE(deleteRequest(`?consultationId=${CONSULTATION_ID}`));

    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("default");
  });
});
