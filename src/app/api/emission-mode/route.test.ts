import { describe, it, expect, vi, beforeEach } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@/services/db", () => ({
  getPool: () => ({ query: queryMock }),
}));

import { GET, PUT } from "./route";

const validConfig = {
  mode: "production" as const,
  configured: { partnerId: true, username: true, accessKey: true, clientId: true, clientSecret: true },
  updatedAt: "2026-08-31T00:00:00.000Z",
};

const DEFAULT_CONFIG = { mode: "sandbox", configured: {}, updatedAt: "1970-01-01T00:00:00.000Z" };

function rowOf(config: typeof validConfig) {
  return { mode: config.mode, configured: config.configured, updated_at: new Date(config.updatedAt) };
}

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /api/emission-mode", () => {
  it("returns the sandbox default when no row exists yet", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(DEFAULT_CONFIG);
  });

  it("reads and returns the saved config, never containing secret values", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [rowOf(validConfig)] });
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(validConfig);
    expect(JSON.stringify(json)).not.toMatch(/secret-|access-key-/i);
  });

  it("falls back to the sandbox default on any read error", async () => {
    queryMock.mockRejectedValue(new Error("network blip"));
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(DEFAULT_CONFIG);
  });
});

describe("PUT /api/emission-mode", () => {
  it("validates and overwrites the shared config on success", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    const req = new Request("http://localhost/api/emission-mode", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validConfig),
    });
    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(validConfig);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO credentials_config/),
      [validConfig.mode, JSON.stringify(validConfig.configured), validConfig.updatedAt],
    );
  });

  it("returns 400 for a schema-invalid config without touching the database", async () => {
    const req = new Request("http://localhost/api/emission-mode", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "nope" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the write fails", async () => {
    queryMock.mockRejectedValue(new Error("connection terminated"));
    const req = new Request("http://localhost/api/emission-mode", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validConfig),
    });
    const res = await PUT(req);
    expect(res.status).toBe(500);
  });
});