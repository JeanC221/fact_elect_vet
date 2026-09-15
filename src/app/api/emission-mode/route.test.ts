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
    const res = await GET(authed("http://localhost/api/emission-mode"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(DEFAULT_CONFIG);
  });

  it("reads and returns the saved config, never containing secret values", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [rowOf(validConfig)] });
    const res = await GET(authed("http://localhost/api/emission-mode"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual(validConfig);
    expect(JSON.stringify(json)).not.toMatch(/secret-|access-key-/i);
  });

  /**
   * A 200 carrying the sandbox default when the read actually FAILED is not a
   * harmless fallback: `useEmissionOptions.fetchServerMode` only discards a
   * response when `!res.ok`, so a 200 makes every device overwrite a correctly
   * cached `production` mode with `sandbox` — and `stampSendFor("sandbox")` is
   * false, so real invoices stop being stamped at the DIAN. The credentials
   * page was already written against a 503 contract this route never honoured.
   */
  it("returns 503 (not a silent 200 sandbox) when the read genuinely fails", async () => {
    queryMock.mockRejectedValue(new Error("network blip"));
    const res = await GET(authed("http://localhost/api/emission-mode"));
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error.code).toBe("storage_unavailable");
    expect(json.mode).toBeUndefined();
  });

  it("returns 503 when the stored row is corrupt, instead of pretending it is sandbox", async () => {
    queryMock.mockResolvedValue({
      rowCount: 1,
      rows: [{ mode: "not-a-mode", configured: {}, updated_at: new Date("2026-08-31T00:00:00.000Z") }],
    });
    const res = await GET(authed("http://localhost/api/emission-mode"));
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error.code).toBe("config_corrupt");
  });

  it("still returns a plain 200 sandbox default when the row is simply absent (legitimate first run)", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    const res = await GET(authed("http://localhost/api/emission-mode"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DEFAULT_CONFIG);
  });
});

describe("PUT /api/emission-mode", () => {
  it("validates and overwrites the shared config on success", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    const req = authed("http://localhost/api/emission-mode", {
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
    const req = authed("http://localhost/api/emission-mode", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "nope" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the write fails", async () => {
    queryMock.mockRejectedValue(new Error("connection terminated"));
    const req = authed("http://localhost/api/emission-mode", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validConfig),
    });
    const res = await PUT(req);
    expect(res.status).toBe(500);
  });
});
/**
 * The asymmetry, asserted from the HANDLER — not only from `proxy.test.ts`.
 *
 * `proxy.test.ts` proves the edge layer lets an employee GET this route and
 * refuses their PUT. It cannot prove the handler agrees, because it never runs
 * the handler. Without the two cases below, applying `requireAdmin` to the GET
 * by mistake would leave all 9 proxy tests green while every reception
 * device silently fell back to `sandbox` — `stampSendFor("sandbox")` is false,
 * so the clinic would emit invoices that are never stamped at the DIAN and have
 * no legal validity. Both sides are asserted: one alone leaves half blind.
 */
describe("GET/PUT /api/emission-mode — role asymmetry enforced by the handler itself", () => {
  it("lets an EMPLOYEE read the emission mode, so the client never defaults to sandbox", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [rowOf(validConfig)] });
    const res = await GET(await sessionRequest("/api/emission-mode", EMPLOYEE_SESSION));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(validConfig);
  });

  it("refuses an EMPLOYEE PUT with 403 — PUT is what flips the account into DIAN production", async () => {
    const res = await PUT(
      await sessionRequest("/api/emission-mode", EMPLOYEE_SESSION, { method: "PUT", body: validConfig }),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: { code: "forbidden", message: "Se requiere rol de administrador." },
    });
  });

  it("refuses the employee PUT before touching the database — no partial write", async () => {
    queryMock.mockReset();
    await PUT(await sessionRequest("/api/emission-mode", EMPLOYEE_SESSION, { method: "PUT", body: validConfig }));
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("refuses an anonymous GET with 401, not an anonymous read of the emission mode", async () => {
    const res = await GET(anonymousRequest("/api/emission-mode"));
    expect(res.status).toBe(401);
  });
});
