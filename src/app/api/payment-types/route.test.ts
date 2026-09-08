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

const samplePaymentTypes = [{ id: 10948, name: "Efectivo", type: "cash", active: true }];

describe("GET /api/payment-types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: "tok-123", partnerId: "PARTNER-ID" });
  });

  it("fails loudly (502) when Siigo auth is missing, instead of silently returning mock data", async () => {
    vi.mocked(getSiigoAccessToken).mockRejectedValue(new SiigoAuthError("missing_credentials", "no env"));
    const res = await GET(authed("http://localhost/api/payment-types"));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error.code).toBe("missing_credentials");
  });

  it("fails loudly (502, service_unavailable) on network failure, instead of silently returning mock data", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const res = await GET(authed("http://localhost/api/payment-types"));
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.error.code).toBe("service_unavailable");
  });

  it("returns parsed payment types on a successful Siigo response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => samplePaymentTypes,
    } as Response) as unknown as typeof fetch;
    const res = await GET(authed("http://localhost/api/payment-types"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(samplePaymentTypes);
  });

  it("fails loudly (502, invalid_payload) when the Siigo response fails Zod validation, instead of silently returning mock data", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "not-a-number", name: "Bad" }],
    } as Response) as unknown as typeof fetch;
    const res = await GET(authed("http://localhost/api/payment-types"));
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
    const res = await GET(authed("http://localhost/api/payment-types"));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("default");
  });
});
