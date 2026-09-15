import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { GET } from "./route";

vi.mock("@/services/siigoAuth", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoAuth")>("@/services/siigoAuth");
  return { ...actual, getSiigoAccessToken: vi.fn() };
});

import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";

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

const sampleProducts = [
  { id: "5bb7d6d6-9c74-4b5f-9d0e-7f9c1a2b3c4d", code: "CONS-001", name: "Consulta general" },
  { id: "7cc8e7e7-0d85-4c6a-8e1f-0a1b2c3d4e5f", code: "VAC-002", name: "Vacuna triple felina" },
];

describe("GET /api/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: "tok-123", partnerId: "PARTNER-ID" });
  });

  it("fails loudly (502) when Siigo auth is missing, instead of silently returning mock data", async () => {
    vi.mocked(getSiigoAccessToken).mockRejectedValue(new SiigoAuthError("missing_credentials", "no env"));
    const res = await GET(authed("http://localhost/api/products"));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("missing_credentials");
  });

  it("fails loudly (502, service_unavailable) on network failure, instead of silently returning mock data", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const res = await GET(authed("http://localhost/api/products"));
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.error.code).toBe("service_unavailable");
  });

  it("unwraps the paginated `results` envelope and returns the product array on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: sampleProducts, pagination: { page: 1, page_size: 25, total_results: 2 } }),
    } as Response) as unknown as typeof fetch;
    const res = await GET(authed("http://localhost/api/products"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(2);
    expect(json[0].code).toBe("CONS-001");
  });

  it("preserves unmapped Siigo fields via passthrough (the real /v1/products shape carries extra keys)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ ...sampleProducts[0], account_group: { id: 1253, name: "Servicios" }, type: "Service" }] }),
    } as Response) as unknown as typeof fetch;
    const res = await GET(authed("http://localhost/api/products"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json[0].type).toBe("Service");
    expect(json[0].account_group.id).toBe(1253);
  });

  it("fails loudly (502, invalid_payload) when the Siigo response is a bare array instead of a `results` envelope", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleProducts,
    } as Response) as unknown as typeof fetch;
    const res = await GET(authed("http://localhost/api/products"));
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.error.code).toBe("invalid_payload");
  });

  it("fails loudly (502, invalid_payload) when a product fails Zod validation, instead of silently returning mock data", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ id: 12345, name: "" }] }),
    } as Response) as unknown as typeof fetch;
    const res = await GET(authed("http://localhost/api/products"));
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.error.code).toBe("invalid_payload");
  });

  it("propagates the real Siigo error status/code when Siigo returns a non-OK HTTP status (e.g. 401), instead of silently returning mock data", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: "auth_failed", message: "Unauthorized" } }),
    } as Response) as unknown as typeof fetch;
    const res = await GET(authed("http://localhost/api/products"));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("default");
  });

  it("calls the Siigo products endpoint with the Partner-Id and Bearer headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;
    await GET(authed("http://localhost/api/products"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v1/products");
    expect(init.headers["Partner-Id"]).toBe("PARTNER-ID");
    expect(init.headers.Authorization).toBe("Bearer tok-123");
  });
});
