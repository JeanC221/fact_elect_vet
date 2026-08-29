import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/services/siigoAuth", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoAuth")>("@/services/siigoAuth");
  return { ...actual, getSiigoAccessToken: vi.fn() };
});

import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";

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
    const req = new Request("http://localhost/api/credentials/health", {
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
    const req = new Request("http://localhost/api/credentials/health", {
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
    const req = new Request("http://localhost/api/credentials/health", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bad),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
