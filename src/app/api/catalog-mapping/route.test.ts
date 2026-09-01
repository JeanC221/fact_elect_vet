import { describe, it, expect, vi, beforeEach } from "vitest";

const { putMock, getMock, MockBlobNotFoundError } = vi.hoisted(() => {
  class MockBlobNotFoundError extends Error {}
  return { putMock: vi.fn(), getMock: vi.fn(), MockBlobNotFoundError };
});
vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => putMock(...args),
  get: (...args: unknown[]) => getMock(...args),
  BlobNotFoundError: MockBlobNotFoundError,
}));

import { GET, PUT } from "./route";

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

/** Build a fake Response-compatible ReadableStream carrying the given JSON body, matching get()'s `.stream` shape. */
function streamOf(body: unknown): ReadableStream {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

beforeEach(() => {
  putMock.mockReset();
  getMock.mockReset();
});

describe("GET /api/catalog-mapping", () => {
  it("returns the empty default mapping when nothing has been saved yet (get() returns null)", async () => {
    getMock.mockResolvedValue(null);
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(EMPTY_MAPPING);
  });

  it("returns the empty default mapping when get() throws BlobNotFoundError", async () => {
    getMock.mockRejectedValue(new MockBlobNotFoundError("not found"));
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(EMPTY_MAPPING);
  });

  it("reads and returns the saved mapping from a private blob", async () => {
    getMock.mockResolvedValue({ stream: streamOf(validMapping) });
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(validMapping);
    expect(getMock).toHaveBeenCalledWith("fact-vet/catalog-mapping.json", { access: "private" });
  });

  it("falls back to the empty default with a 503 when the stored blob is schema-invalid (real problem, not first-run)", async () => {
    getMock.mockResolvedValue({ stream: streamOf({ items: "not-an-array" }) });
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json).toEqual(EMPTY_MAPPING);
  });

  it("falls back to the empty default with a 503 on any other read error — never a silent 200 'no mapping saved' reading", async () => {
    getMock.mockRejectedValue(new Error("network blip"));
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json).toEqual(EMPTY_MAPPING);
  });
});

describe("PUT /api/catalog-mapping — optimistic concurrency", () => {
  it("saves and bumps the version when the client's version matches the server's current version", async () => {
    getMock.mockResolvedValue({ stream: streamOf(validMapping) }); // server currently at version:1
    putMock.mockResolvedValue({ url: "https://blob.example/catalog-mapping.json" });
    const req = new Request("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validMapping), // sends version:1
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.version).toBe(2); // bumped server-side
    expect(putMock).toHaveBeenCalledWith(
      "fact-vet/catalog-mapping.json",
      JSON.stringify({ ...validMapping, version: 2 }),
      expect.objectContaining({ access: "private", contentType: "application/json", allowOverwrite: true }),
    );
  });

  it("saves the very first mapping when nothing exists yet (server version:0, client sends version:0)", async () => {
    getMock.mockResolvedValue(null); // nothing saved -> EMPTY_MAPPING, version:0
    putMock.mockResolvedValue({ url: "https://blob.example/catalog-mapping.json" });
    const firstSave = { ...validMapping, version: 0 };
    const req = new Request("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(firstSave),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.version).toBe(1);
  });

  it("returns 409 and the server's current mapping when the client's version is stale (another device already saved)", async () => {
    // Server is already at version:2 (another device saved after this client last read version:1).
    const serverCurrent = { ...validMapping, version: 2, updatedAt: "2026-08-31T05:00:00.000Z" };
    getMock.mockResolvedValue({ stream: streamOf(serverCurrent) });
    const staleClientPayload = { ...validMapping, version: 1 }; // this client still thinks it's version:1
    const req = new Request("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(staleClientPayload),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error.code).toBe("version_conflict");
    expect(json.error.message).toContain("Recargue la página");
    expect(json.current).toEqual(serverCurrent);
    expect(putMock).not.toHaveBeenCalled(); // never overwrites the newer server state
  });

  it("returns 400 for a schema-invalid mapping without calling get() version-check or put()", async () => {
    const req = new Request("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: "nope" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("returns 500 with a clear message when the Blob write itself fails", async () => {
    getMock.mockResolvedValue({ stream: streamOf(validMapping) }); // version matches, passes OCC check
    putMock.mockRejectedValue(new Error("Blob store unavailable"));
    const req = new Request("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validMapping),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error.message).toContain("Blob store unavailable");
  });

  it("returns 503 and never writes when the version-check read itself fails — refuses to save blind over an unverified current state", async () => {
    getMock.mockRejectedValue(new Error("network blip"));
    const req = new Request("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validMapping),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error.code).toBe("storage_unavailable");
    expect(putMock).not.toHaveBeenCalled();
  });
});