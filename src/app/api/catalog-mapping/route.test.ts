import { describe, it, expect, vi, beforeEach } from "vitest";

const putMock = vi.fn();
const headMock = vi.fn();
vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => putMock(...args),
  head: (...args: unknown[]) => headMock(...args),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

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

beforeEach(() => {
  putMock.mockReset();
  headMock.mockReset();
  fetchMock.mockReset();
});

describe("GET /api/catalog-mapping", () => {
  it("returns the empty default mapping when nothing has been saved yet (head() throws / not found)", async () => {
    headMock.mockRejectedValue(new Error("not found"));
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(EMPTY_MAPPING);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches and returns the saved mapping when a blob exists", async () => {
    headMock.mockResolvedValue({ url: "https://blob.example/catalog-mapping.json" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => validMapping });
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(validMapping);
    expect(fetchMock).toHaveBeenCalledWith("https://blob.example/catalog-mapping.json", { cache: "no-store" });
  });

  it("falls back to the empty default when the stored blob is schema-invalid", async () => {
    headMock.mockResolvedValue({ url: "https://blob.example/catalog-mapping.json" });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: "not-an-array" }) });
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(EMPTY_MAPPING);
  });

  it("falls back to the empty default when the blob fetch itself fails", async () => {
    headMock.mockResolvedValue({ url: "https://blob.example/catalog-mapping.json" });
    fetchMock.mockResolvedValue({ ok: false });
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(EMPTY_MAPPING);
  });
});

describe("PUT /api/catalog-mapping", () => {
  it("validates and overwrites the shared blob on success", async () => {
    putMock.mockResolvedValue({ url: "https://blob.example/catalog-mapping.json" });
    const req = new Request("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validMapping),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(validMapping);
    expect(putMock).toHaveBeenCalledWith(
      "fact-vet/catalog-mapping.json",
      JSON.stringify(validMapping),
      expect.objectContaining({ access: "public", contentType: "application/json", allowOverwrite: true }),
    );
  });

  it("returns 400 for a schema-invalid mapping without calling put()", async () => {
    const req = new Request("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: "nope" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("returns 500 with a clear message when the Blob write itself fails", async () => {
    putMock.mockRejectedValue(new Error("Blob store unavailable"));
    const req = new Request("http://localhost/api/catalog-mapping", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validMapping),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.error.message).toContain("Blob store unavailable");
  });
});