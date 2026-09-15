import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const { queryMock, connectMock, clientQueryMock, clientReleaseMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  connectMock: vi.fn(),
  clientQueryMock: vi.fn(),
  clientReleaseMock: vi.fn(),
}));
vi.mock("@/services/db", () => ({
  getPool: () => ({
    query: queryMock,
    connect: connectMock,
  }),
}));

import { GET, PUT } from "./route";

import {
  TEST_JWT_SECRET,
  ADMIN_SESSION,
  issueSessionCookie,
  requestWithCookie,
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

const entryA = {
  invoiceId: "INV-7751", invoiceNumber: "1234", cufe: "CUFE-abc123",
  status: "Accepted" as const, consultationId: "CON-001", paymentMethod: "Efectivo",
  emittedAt: "2026-08-31T00:00:00.000Z",
};
const entryB = {
  invoiceId: "INV-9002", invoiceNumber: "1235", cufe: "CUFE-def456",
  status: "Accepted" as const, consultationId: "CON-002", paymentMethod: "Davivienda",
  emittedAt: "2026-08-31T01:00:00.000Z",
};

/** Build a fake pg row matching what the SELECT query returns. */
function rowOf(entry: typeof entryA | typeof entryB | { invoiceId: string; invoiceNumber?: string; cufe: string; status: "Accepted" | "Draft" | "Rejected" | "Annulled"; consultationId: string; paymentMethod: string; emittedAt: string; observations?: string; patientName?: string }, createdAt: string) {
  return {
    invoice_id: entry.invoiceId,
    invoice_number: entry.invoiceNumber ?? null,
    cufe: entry.cufe,
    status: entry.status,
    consultation_id: entry.consultationId,
    payment_method: entry.paymentMethod,
    observations: "observations" in entry ? (entry as { observations?: string }).observations ?? null : null,
    emitted_at: new Date(entry.emittedAt),
    patient_name: "patientName" in entry ? (entry as { patientName?: string }).patientName ?? null : null,
    form_snapshot: null,
    created_at: new Date(createdAt),
  };
}

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  clientQueryMock.mockReset();
  clientReleaseMock.mockReset();
  connectMock.mockResolvedValue({ query: clientQueryMock, release: clientReleaseMock });
  clientQueryMock.mockResolvedValue({ rowCount: 1, rows: [] }); // default: BEGIN/INSERT/COMMIT all succeed
});

describe("GET /api/invoice-history", () => {
  it("returns an empty array when no rows exist yet", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    const res = await GET(authed("http://localhost/api/invoice-history"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual([]);
  });

  it("reads and returns the saved history in insertion order", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [rowOf(entryA, "2026-08-31T00:00:00.000Z")] });
    const res = await GET(authed("http://localhost/api/invoice-history"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual([entryA]);
  });

  it("returns 503 (not a silent 200 empty array) when the read genuinely fails", async () => {
    queryMock.mockRejectedValue(new Error("network blip"));
    const res = await GET(authed("http://localhost/api/invoice-history"));
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json).toEqual([]);
  });
});

describe("PUT /api/invoice-history", () => {
  it("upserts a single entry into an empty history", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [rowOf(entryA, "2026-08-31T00:00:00.000Z")] }); // confirmation read after write
    const req = authed("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [entryA] }),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual([entryA]);
    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO invoices/), expect.arrayContaining([entryA.invoiceId]));
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
  });

  it("merges a new entry alongside an existing one written by another device — never overwrites it", async () => {
    // Confirmation read reflects both rows after the upsert; entryA keeps its original created_at (earlier), entryB is newer.
    queryMock.mockResolvedValueOnce({
      rowCount: 2,
      rows: [rowOf(entryA, "2026-08-31T00:00:00.000Z"), rowOf(entryB, "2026-08-31T01:00:00.000Z")],
    });
    const req = authed("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [entryB] }),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual([entryA, entryB]);
  });

  it("updates an existing entry in place by invoiceId (e.g. annulment status change) without moving its position", async () => {
    const annulled = { ...entryA, status: "Annulled" as const, observations: "Anulada vía nota crédito NC-1" };
    // created_at for entryA's row is untouched by ON CONFLICT DO UPDATE, so it still sorts before entryB.
    queryMock.mockResolvedValueOnce({
      rowCount: 2,
      rows: [rowOf(annulled, "2026-08-31T00:00:00.000Z"), rowOf(entryB, "2026-08-31T01:00:00.000Z")],
    });
    const req = authed("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [annulled] }),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual([annulled, entryB]);
  });

  it("accepts the single-entry shorthand shape", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [rowOf(entryA, "2026-08-31T00:00:00.000Z")] });
    const req = authed("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entry: entryA }),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual([entryA]);
  });

  it("persists and returns patientName (frozen at emission time, must not be lost on write/read)", async () => {
    const entryWithPatient = { ...entryA, patientName: "Bart Simpson" };
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [rowOf(entryWithPatient, "2026-08-31T00:00:00.000Z")] });
    const req = authed("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entry: entryWithPatient }),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json[0].patientName).toBe("Bart Simpson");
    // The INSERT must actually carry patient_name through to Postgres, not just accept it in memory.
    expect(clientQueryMock).toHaveBeenCalledWith(expect.stringMatching(/patient_name/), expect.arrayContaining(["Bart Simpson"]));
  });

  it("returns 400 for a schema-invalid body without opening a transaction", async () => {
    const req = authed("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [{ invoiceId: "" }] }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a raw array body (old pre-merge contract is no longer accepted)", async () => {
    const req = authed("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify([entryA]),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("rolls back and returns 500 when the INSERT fails mid-transaction", async () => {
    clientQueryMock.mockReset();
    clientQueryMock
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error("constraint violation")); // INSERT fails
    const req = authed("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [entryA] }),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error.message).toContain("constraint violation");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(clientReleaseMock).toHaveBeenCalled();
  });

  it("returns 503 when the write succeeds but the confirmation read fails — never claims the write itself failed", async () => {
    queryMock.mockRejectedValueOnce(new Error("network blip")); // confirmation read after a successful write
    const req = authed("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [entryA] }),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error.code).toBe("storage_unavailable");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT"); // the write itself did succeed
  });
});