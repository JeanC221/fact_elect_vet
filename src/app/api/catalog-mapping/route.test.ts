import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@/services/db", () => ({
  getPool: () => ({ query: queryMock }),
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
 * `middleware.test.ts` and, for the emission-mode asymmetry, by the dedicated
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

const validMapping = {
  items: [{ provetCode: "SERV-CG-01", siigoProductId: "PROD-001" }],
  payments: [{ provetMethod: "Efectivo", siigoPaymentTypeId: 10948 }],
  version: 1,
  updatedAt: "2026-08-31T00:00:00.000Z",
  documentTypeId: 2372,
  creditNoteDocumentTypeId: 2379,
  sellerId: 62,
};

const EMPTY_MAPPING = {
  items: [],
  payments: [],
  version: 0,
  updatedAt: "1970-01-01T00:00:00.000Z",
  documentTypeId: null,
  creditNoteDocumentTypeId: null,
  sellerId: null,
};

/** Build a fake pg row matching what the SELECT/UPDATE...RETURNING queries return. */
function rowOf(mapping: typeof validMapping) {
  return {
    items: mapping.items,
    payments: mapping.payments,
    version: mapping.version,
    document_type_id: mapping.documentTypeId,
    credit_note_document_type_id: mapping.creditNoteDocumentTypeId,
    seller_id: mapping.sellerId,
    updated_at: new Date(mapping.updatedAt),
  };
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /api/catalog-mapping", () => {
  it("returns the empty default mapping when no row exists yet", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    const res = await GET(authed("http://localhost/api/catalog-mapping"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(EMPTY_MAPPING);
  });

  it("reads and returns the saved mapping", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [rowOf(validMapping)] });
    const res = await GET(authed("http://localhost/api/catalog-mapping"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(validMapping);
  });

  it("falls back to the empty default with a 503 on any read error — never a silent 200 'no mapping saved' reading", async () => {
    queryMock.mockRejectedValue(new Error("network blip"));
    const res = await GET(authed("http://localhost/api/catalog-mapping"));
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json).toEqual(EMPTY_MAPPING);
  });
});

describe("PUT /api/catalog-mapping — optimistic concurrency", () => {
  it("saves and bumps the version when the client's version matches the server's current version", async () => {
    // The atomic UPDATE...WHERE version=$6 RETURNING succeeds and comes back with version already bumped to 2.
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [rowOf({ ...validMapping, version: 2 })] });
    const req = authed("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validMapping), // sends version:1
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.version).toBe(2);
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/UPDATE catalog_mapping/);
    expect(sql).toMatch(/WHERE id = 1 AND version = \$6/);
    expect(params[5]).toBe(1); // client's version passed as the WHERE check
  });

  it("saves the very first mapping when the row is still at version:0", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [rowOf({ ...validMapping, version: 1 })] });
    const firstSave = { ...validMapping, version: 0 };
    const req = authed("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(firstSave),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.version).toBe(1);
  });

  it("returns 409 and the server's current mapping when the client's version is stale (another device already saved)", async () => {
    // UPDATE...WHERE version=$6 matches nothing (rowCount 0) because the row is already past the client's version.
    const serverCurrent = { ...validMapping, version: 2, updatedAt: "2026-08-31T05:00:00.000Z" };
    queryMock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // UPDATE finds no matching row
      .mockResolvedValueOnce({ rowCount: 1, rows: [rowOf(serverCurrent)] }); // follow-up SELECT for `current`
    const staleClientPayload = { ...validMapping, version: 1 }; // this client still thinks it's version:1
    const req = authed("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(staleClientPayload),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error.code).toBe("version_conflict");
    expect(json.error.message).toContain("Recargue la página");
    expect(json.current).toEqual(serverCurrent);
    expect(queryMock).toHaveBeenCalledTimes(2); // UPDATE attempt + reconciliation SELECT, never a second write
  });

  it("returns 400 for a schema-invalid mapping without touching the database", async () => {
    const req = authed("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: "nope" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 500 with a clear message when the UPDATE itself fails", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection terminated"));
    const req = authed("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validMapping),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error.message).toContain("connection terminated");
  });

  it("returns 503 when rowCount is 0 and the reconciliation read itself also fails", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // UPDATE finds no matching row
      .mockRejectedValueOnce(new Error("network blip")); // reconciliation SELECT fails too
    const req = authed("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validMapping),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error.code).toBe("storage_unavailable");
  });
});