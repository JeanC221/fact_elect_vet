import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { mockSiigoPaymentTypes } from "@/mocks/siigo";

vi.mock("@/services/siigoAuth", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoAuth")>("@/services/siigoAuth");
  return { ...actual, getSiigoAccessToken: vi.fn() };
});

import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";

describe("GET /api/payment-types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: "tok-123", partnerId: "PARTNER-ID" });
  });

  it("returns mock payment types when Siigo auth is missing (sandbox fallback)", async () => {
    vi.mocked(getSiigoAccessToken).mockRejectedValue(new SiigoAuthError("missing_credentials", "no env"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockSiigoPaymentTypes);
  });

  it("returns mock payment types on network failure (sandbox fallback)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockSiigoPaymentTypes);
  });

  it("returns parsed payment types on a successful Siigo response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSiigoPaymentTypes,
    } as Response) as unknown as typeof fetch;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockSiigoPaymentTypes);
  });

  it("falls back to mocks when the Siigo response fails Zod validation", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "not-a-number", name: "Bad" }],
    } as Response) as unknown as typeof fetch;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockSiigoPaymentTypes);
  });

  it("falls back to mocks when Siigo returns a non-OK HTTP status (e.g. 401)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: "auth_failed", message: "Unauthorized" } }),
    } as Response) as unknown as typeof fetch;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockSiigoPaymentTypes);
  });
});
