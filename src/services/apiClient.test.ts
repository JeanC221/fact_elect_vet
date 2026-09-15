import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiRequest } from "./apiClient";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => fetchMock.mockReset());
afterEach(() => fetchMock.mockReset());

const res = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe("apiRequest — request construction", () => {
  it("sends a bare GET with no headers/body when none are given", async () => {
    fetchMock.mockResolvedValue(res({ x: 1 }));
    await apiRequest("/api/health");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/health");
    expect(init).toEqual({ method: undefined, headers: undefined, body: undefined, cache: undefined });
  });

  it("passes cache through untouched", async () => {
    fetchMock.mockResolvedValue(res({}));
    await apiRequest("/api/health", { cache: "no-store" });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("JSON.stringify's an object body and sets Content-Type", async () => {
    fetchMock.mockResolvedValue(res({}));
    await apiRequest("/api/invoices", { method: "POST", body: { consultationId: "C-1" } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ consultationId: "C-1" }));
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("sends a string body verbatim (already-serialized callers keep their own encoding)", async () => {
    fetchMock.mockResolvedValue(res({}));
    await apiRequest("/api/catalog-mapping", { method: "PUT", body: "{\"raw\":true}" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe('{"raw":true}');
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("does not set Content-Type when there is no body", async () => {
    fetchMock.mockResolvedValue(res({}));
    await apiRequest("/api/health");
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
  });

  it("respects a caller-supplied Content-Type instead of overwriting it", async () => {
    fetchMock.mockResolvedValue(res({}));
    await apiRequest("/api/x", { method: "POST", body: "raw", headers: { "Content-Type": "text/plain" } });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ "Content-Type": "text/plain" });
  });

  it("adds X-Idempotency-Key only when supplied", async () => {
    fetchMock.mockResolvedValue(res({}));
    await apiRequest("/api/invoices", { method: "POST", body: {}, idempotencyKey: "IDEM-1" });
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ "X-Idempotency-Key": "IDEM-1" });
  });

  it("merges caller headers with the Content-Type/idempotency headers it adds", async () => {
    fetchMock.mockResolvedValue(res({}));
    await apiRequest("/api/x", { method: "POST", body: {}, idempotencyKey: "IDEM-1", headers: { "X-Custom": "1" } });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      "X-Custom": "1",
      "Content-Type": "application/json",
      "X-Idempotency-Key": "IDEM-1",
    });
  });
});

describe("apiRequest — response handling", () => {
  it("returns ok/status/data for a successful JSON response", async () => {
    fetchMock.mockResolvedValue(res({ hello: "world" }, 200));
    const result = await apiRequest<{ hello: string }>("/api/x");
    expect(result).toEqual({ ok: true, status: 200, data: { hello: "world" } });
  });

  it("still parses the body on a non-2xx response (error bodies carry a code/message)", async () => {
    fetchMock.mockResolvedValue(res({ error: { code: "requests_limit" } }, 429));
    const result = await apiRequest("/api/x");
    expect(result).toEqual({ ok: false, status: 429, data: { error: { code: "requests_limit" } } });
  });

  it("returns data: null instead of throwing when the body is not valid JSON", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } } as unknown as Response);
    const result = await apiRequest("/api/x");
    expect(result).toEqual({ ok: true, status: 200, data: null });
  });

  it("propagates a network failure as a rejected promise (caller's try/catch handles it)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(apiRequest("/api/x")).rejects.toThrow("Failed to fetch");
  });

  it("preserves a 503 status distinctly from a plain non-ok (mapping/credentials 503-vs-'no data yet' distinction)", async () => {
    fetchMock.mockResolvedValue(res({ error: "storage_unavailable" }, 503));
    const result = await apiRequest("/api/catalog-mapping");
    expect(result.status).toBe(503);
    expect(result.ok).toBe(false);
  });

  it("preserves a 409 status with its conflict body (mapping save 'current' merge case)", async () => {
    fetchMock.mockResolvedValue(res({ current: { updatedAt: "2026-09-15" } }, 409));
    const result = await apiRequest("/api/catalog-mapping", { method: "PUT", body: "{}" });
    expect(result.status).toBe(409);
    expect(result.data).toEqual({ current: { updatedAt: "2026-09-15" } });
  });
});
