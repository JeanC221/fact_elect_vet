import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { mockSiigoProducts } from "@/mocks/siigo";

vi.mock("@/services/siigoAuth", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoAuth")>("@/services/siigoAuth");
  return { ...actual, getSiigoAccessToken: vi.fn() };
});

import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";

describe("GET /api/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: "tok-123", partnerId: "PARTNER-ID" });
  });

  it("returns mock products when Siigo auth is missing (sandbox fallback)", async () => {
    vi.mocked(getSiigoAccessToken).mockRejectedValue(new SiigoAuthError("missing_credentials", "no env"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockSiigoProducts);
  });

  it("returns mock products on network failure (sandbox fallback)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockSiigoProducts);
  });

  it("returns parsed products on a successful Siigo response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSiigoProducts,
    } as Response) as unknown as typeof fetch;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockSiigoProducts);
  });

  it("falls back to mocks when the Siigo response fails Zod validation", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "P1", code: "C1", name: "Bad", price: "not-a-number", tax_classification: "IVA_19", unit_of_measure: "UND" }],
    } as Response) as unknown as typeof fetch;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockSiigoProducts);
  });

  it("falls back to mocks when Siigo returns a non-OK HTTP status (e.g. 500)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: "server_error", message: "Internal" } }),
    } as Response) as unknown as typeof fetch;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(mockSiigoProducts);
  });
});
