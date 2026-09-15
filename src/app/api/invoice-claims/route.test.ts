import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { NextRequest } from "next/server";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@/services/db", () => ({ getPool: () => ({ query: queryMock }) }));

import { GET, DELETE } from "./route";

import {
  TEST_JWT_SECRET,
  ADMIN_SESSION,
  issueSessionCookie,
  requestWithCookie,
  EMPLOYEE_SESSION,
  sessionRequest,
  anonymousRequest,
} from "@/test/sessionRequest";

/**
 * D0 added a session guard to every route handler, so these tests now send a
 * genuinely signed cookie. An admin session is used because it satisfies both
 * `requireSession` and `requireAdmin`; the role boundary itself is covered by
 * `proxy.test.ts` and, for the emission-mode asymmetry, by the dedicated
 * employee cases in `src/app/api/emission-mode/route.test.ts`.
 */
let sessionCookie: string;
beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  sessionCookie = await issueSessionCookie(ADMIN_SESSION);
});

/** Authenticated request builder — same signature as the plain `new Request`. */
function authed(url: string, init: RequestInit = {}) {
  return requestWithCookie(url, sessionCookie, init);
}

const CONSULTATION_ID = "provet-consult-777";

function deleteRequest(query: string): NextRequest {
  return authed(`http://localhost/api/invoice-claims${query}`, { method: "DELETE" });
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

    const res = await GET(authed("http://localhost/api/invoice-claims"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.count).toBe(2);
    expect(json.claims.map((c: { consultationId: string }) => c.consultationId)).toEqual(["c-1", "c-2"]);
    expect(queryMock.mock.calls[0][0]).toContain("status <> 'emitted'");
  });

  it("returns 500 rather than an empty list when the database is unreachable — an empty list would read as 'nothing is blocked'", async () => {
    queryMock.mockRejectedValue(new Error("connection terminated"));
    const res = await GET(authed("http://localhost/api/invoice-claims"));
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

/**
 * Admin-only on EVERY method, asserted from the handler. Releasing a claim
 * removes the only server-side guard against stamping a second DIAN document
 * for the same consultation, so the method exception granted to
 * `GET /api/emission-mode` must never leak here.
 */
describe("/api/invoice-claims — admin-only on both methods, enforced by the handler", () => {
  it("refuses an employee GET with 403", async () => {
    const res = await GET(await sessionRequest("/api/invoice-claims", EMPLOYEE_SESSION));
    expect(res.status).toBe(403);
  });

  it("refuses an employee DELETE with 403 and never reaches the claim service", async () => {
    queryMock.mockReset();
    const res = await DELETE(
      await sessionRequest("/api/invoice-claims?consultationId=c-1", EMPLOYEE_SESSION, { method: "DELETE" }),
    );
    expect(res.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("refuses an anonymous DELETE with 401", async () => {
    const res = await DELETE(anonymousRequest("/api/invoice-claims?consultationId=c-1", { method: "DELETE" }));
    expect(res.status).toBe(401);
  });
});
