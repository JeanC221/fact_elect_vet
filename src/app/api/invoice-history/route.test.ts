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

function streamOf(body: unknown): ReadableStream {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}

beforeEach(() => {
  putMock.mockReset();
  getMock.mockReset();
});

describe("GET /api/invoice-history", () => {
  it("returns an empty array when nothing has been saved yet", async () => {
    getMock.mockResolvedValue(null);
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual([]);
  });

  it("returns an empty array when get() throws BlobNotFoundError", async () => {
    getMock.mockRejectedValue(new MockBlobNotFoundError("not found"));
    const res = await GET();
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it("reads and returns the saved history from a private blob", async () => {
    getMock.mockResolvedValue({ stream: streamOf([entryA]) });
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual([entryA]);
    expect(getMock).toHaveBeenCalledWith("fact-vet/invoice-history.json", { access: "private" });
  });

  it("falls back to an empty array when the stored blob is schema-invalid", async () => {
    getMock.mockResolvedValue({ stream: streamOf([{ invoiceId: "" }]) });
    const res = await GET();
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it("falls back to an empty array on any other read error", async () => {
    getMock.mockRejectedValue(new Error("network blip"));
    const res = await GET();
    const json = await res.json();
    expect(json).toEqual([]);
  });
});

describe("PUT /api/invoice-history", () => {
  it("upserts a single entry into an empty history", async () => {
    getMock.mockResolvedValue(null);
    putMock.mockResolvedValue({ url: "https://blob.example/invoice-history.json" });
    const req = new Request("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [entryA] }),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual([entryA]);
    expect(putMock).toHaveBeenCalledWith(
      "fact-vet/invoice-history.json",
      JSON.stringify([entryA]),
      expect.objectContaining({ access: "private", contentType: "application/json", allowOverwrite: true }),
    );
  });

  it("merges a new entry alongside an existing one written by another device — never overwrites it", async () => {
    getMock.mockResolvedValue({ stream: streamOf([entryA]) });
    putMock.mockResolvedValue({ url: "https://blob.example/invoice-history.json" });
    const req = new Request("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [entryB] }),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual([entryA, entryB]);
    expect(putMock).toHaveBeenCalledWith(
      "fact-vet/invoice-history.json",
      JSON.stringify([entryA, entryB]),
      expect.objectContaining({ access: "private" }),
    );
  });

  it("updates an existing entry in place by invoiceId (e.g. annulment status change) without touching others", async () => {
    getMock.mockResolvedValue({ stream: streamOf([entryA, entryB]) });
    putMock.mockResolvedValue({ url: "https://blob.example/invoice-history.json" });
    const annulled = { ...entryA, status: "Annulled" as const, observations: "Anulada vía nota crédito NC-1" };
    const req = new Request("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [annulled] }),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual([annulled, entryB]);
  });

  it("accepts the single-entry shorthand shape", async () => {
    getMock.mockResolvedValue(null);
    putMock.mockResolvedValue({ url: "https://blob.example/invoice-history.json" });
    const req = new Request("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entry: entryA }),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual([entryA]);
  });

  it("returns 400 for a schema-invalid body without calling put()", async () => {
    const req = new Request("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [{ invoiceId: "" }] }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a raw array body (old pre-merge contract is no longer accepted)", async () => {
    const req = new Request("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify([entryA]),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the Blob write fails", async () => {
    getMock.mockResolvedValue(null);
    putMock.mockRejectedValue(new Error("Blob store unavailable"));
    const req = new Request("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [entryA] }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(500);
  });

  it("returns 503 and never writes when the pre-merge read itself fails — refuses to merge on top of an unverified base (would silently wipe the real history)", async () => {
    getMock.mockRejectedValue(new Error("network blip"));
    const req = new Request("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries: [entryA] }),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error.code).toBe("storage_unavailable");
    expect(putMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/invoice-history — storage failure visibility", () => {
  it("returns 503 (not a silent 200 empty array) when the read genuinely fails", async () => {
    getMock.mockRejectedValue(new Error("network blip"));
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json).toEqual([]);
  });
});