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

const validConfig = {
  mode: "production" as const,
  configured: { partnerId: true, username: true, accessKey: true, clientId: true, clientSecret: true },
  updatedAt: "2026-08-31T00:00:00.000Z",
};

const DEFAULT_CONFIG = { mode: "sandbox", configured: {}, updatedAt: "1970-01-01T00:00:00.000Z" };

function streamOf(body: unknown): ReadableStream {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}

beforeEach(() => {
  putMock.mockReset();
  getMock.mockReset();
});

describe("GET /api/emission-mode", () => {
  it("returns the sandbox default when nothing has been saved yet", async () => {
    getMock.mockResolvedValue(null);
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(DEFAULT_CONFIG);
  });

  it("returns the sandbox default when get() throws BlobNotFoundError", async () => {
    getMock.mockRejectedValue(new MockBlobNotFoundError("not found"));
    const res = await GET();
    const json = await res.json();
    expect(json).toEqual(DEFAULT_CONFIG);
  });

  it("reads and returns the saved config, never containing secret values", async () => {
    getMock.mockResolvedValue({ stream: streamOf(validConfig) });
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(validConfig);
    expect(getMock).toHaveBeenCalledWith("fact-vet/credentials-config.json", { access: "private" });
    // No accessKey/clientSecret VALUES anywhere in the response — only booleans.
    expect(JSON.stringify(json)).not.toMatch(/secret-|access-key-/i);
  });

  it("falls back to the sandbox default when the stored blob is schema-invalid", async () => {
    getMock.mockResolvedValue({ stream: streamOf({ mode: "not-a-real-mode" }) });
    const res = await GET();
    const json = await res.json();
    expect(json).toEqual(DEFAULT_CONFIG);
  });
});

describe("PUT /api/emission-mode", () => {
  it("validates and overwrites the shared config on success", async () => {
    putMock.mockResolvedValue({ url: "https://blob.example/credentials-config.json" });
    const req = new Request("http://localhost/api/emission-mode", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validConfig),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(validConfig);
    expect(putMock).toHaveBeenCalledWith(
      "fact-vet/credentials-config.json",
      JSON.stringify(validConfig),
      expect.objectContaining({ access: "private", contentType: "application/json", allowOverwrite: true }),
    );
  });

  it("returns 400 for a schema-invalid config without calling put()", async () => {
    const req = new Request("http://localhost/api/emission-mode", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "nope" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the Blob write fails", async () => {
    putMock.mockRejectedValue(new Error("Blob store unavailable"));
    const req = new Request("http://localhost/api/emission-mode", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validConfig),
    });
    const res = await PUT(req);
    expect(res.status).toBe(500);
  });
});