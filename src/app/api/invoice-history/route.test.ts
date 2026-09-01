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

const validHistory = [
  {
    invoiceId: "INV-7751", invoiceNumber: "1234", cufe: "CUFE-abc123",
    status: "Accepted" as const, consultationId: "CON-001", paymentMethod: "Efectivo",
    emittedAt: "2026-08-31T00:00:00.000Z",
  },
];

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
    getMock.mockResolvedValue({ stream: streamOf(validHistory) });
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(validHistory);
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
  it("validates and overwrites the shared history on success", async () => {
    putMock.mockResolvedValue({ url: "https://blob.example/invoice-history.json" });
    const req = new Request("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validHistory),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(validHistory);
    expect(putMock).toHaveBeenCalledWith(
      "fact-vet/invoice-history.json",
      JSON.stringify(validHistory),
      expect.objectContaining({ access: "private", contentType: "application/json", allowOverwrite: true }),
    );
  });

  it("returns 400 for a schema-invalid history without calling put()", async () => {
    const req = new Request("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify([{ invoiceId: "" }]),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the Blob write fails", async () => {
    putMock.mockRejectedValue(new Error("Blob store unavailable"));
    const req = new Request("http://localhost/api/invoice-history", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validHistory),
    });
    const res = await PUT(req);
    expect(res.status).toBe(500);
  });
});