import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { POST } from "./route";

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

const validCreds = {
  partnerId: "VETPARTNER01",
  username: "api-user@vet.com",
  accessKey: "secret-access-key",
  clientId: "client-id",
  clientSecret: "client-secret",
};

describe("POST /api/credentials/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: "tok", partnerId: "VETPARTNER01" });
  });

  it("returns ok=true on successful auth", async () => {
    const req = authed("http://localhost/api/credentials/health", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validCreds),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(getSiigoAccessToken).toHaveBeenCalledWith({
      username: validCreds.username, accessKey: validCreds.accessKey, partnerId: validCreds.partnerId,
    });
  });

  it("returns 502 with Spanish message on SiigoAuthError", async () => {
    vi.mocked(getSiigoAccessToken).mockRejectedValue(new SiigoAuthError("auth_failed", "Credenciales invalidas"));
    const req = authed("http://localhost/api/credentials/health", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validCreds),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("auth_failed");
  });

  it("returns 400 for Zod-invalid credentials", async () => {
    const bad = { ...validCreds, partnerId: "ab" };
    const req = authed("http://localhost/api/credentials/health", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bad),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
