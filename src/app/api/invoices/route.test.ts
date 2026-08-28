import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { siigoInvoicePayloadSchema } from "@/schemas/siigo";
import { mockSiigoInvoicePayloads } from "@/mocks/siigo";

const validPayload = siigoInvoicePayloadSchema.parse(mockSiigoInvoicePayloads[0]);

const mockAccessToken = "tok-live-123";
const mockPartnerId = "PARTNER-LIVE";

vi.mock("@/services/siigoAuth", () => ({
  getSiigoAccessToken: vi.fn(),
}));

vi.mock("@/services/siigoApi", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoApi")>("@/services/siigoApi");
  return {
    ...actual,
    submitInvoice: vi.fn(),
  };
});

import { getSiigoAccessToken } from "@/services/siigoAuth";
import { submitInvoice } from "@/services/siigoApi";

describe("POST /api/invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: mockAccessToken, partnerId: mockPartnerId });
  });

  it("returns the Siigo response on success", async () => {
    const siigoResponse = { id: "INV-1", number: "FV-1-123", cufe: "CUFE-123", status: "Accepted" as const };
    vi.mocked(submitInvoice).mockResolvedValue(siigoResponse);

    const req = new Request("http://localhost/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Idempotency-Key": "IDEM-KEY-123" },
      body: JSON.stringify(validPayload),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(siigoResponse);
    expect(submitInvoice).toHaveBeenCalledWith(validPayload, mockAccessToken, mockPartnerId, "IDEM-KEY-123");
  });

  it("returns 400 for a Zod-invalid payload", async () => {
    const bad = { ...validPayload, total: 1 };
    const req = new Request("http://localhost/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bad),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("invalid_payload");
  });

  it("returns 502 with a structured error when Siigo rejects", async () => {
    const { SiigoApiError } = await import("@/services/siigoApi");
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("invalid_identification", "NIT inválido"));

    const req = new Request("http://localhost/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error.code).toBe("invalid_identification");
    expect(json.error.message).toBe("NIT inválido");
  });
});
