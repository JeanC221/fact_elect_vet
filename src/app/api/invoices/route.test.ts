import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { siigoInvoicePayloadSchema } from "@/schemas/siigo";
import { mockSiigoInvoicePayloads } from "@/mocks/siigo";

const validPayload = siigoInvoicePayloadSchema.parse(mockSiigoInvoicePayloads[0]);

const mockAccessToken = "tok-live-123";
const mockPartnerId = "PARTNER-LIVE";

vi.mock("@/services/siigoAuth", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoAuth")>("@/services/siigoAuth");
  return { ...actual, getSiigoAccessToken: vi.fn() };
});

vi.mock("@/services/siigoApi", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoApi")>("@/services/siigoApi");
  return { ...actual, submitInvoice: vi.fn() };
});

import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { SiigoApiError, submitInvoice } from "@/services/siigoApi";

describe("POST /api/invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: mockAccessToken, partnerId: mockPartnerId });
  });

  it("returns the Siigo response on success", async () => {
    const siigoResponse = { id: "INV-1", number: 123, cufe: "CUFE-123", status: "Accepted" as const, observations: undefined };
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
    const bad = { ...validPayload, seller: -1 };
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

  it("returns 502 with a Spanish message when SiigoAuthError is thrown", async () => {
    vi.mocked(getSiigoAccessToken).mockRejectedValue(new SiigoAuthError("missing_credentials", "SIIGO_USERNAME no configurada."));

    const req = new Request("http://localhost/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error.code).toBe("missing_credentials");
    expect(json.error.message).toContain("Error de autenticacion");
    expect(json.error.message).not.toContain("SIIGO_USERNAME");
  });

  it("returns 400 with a structured error when Siigo rejects with 400", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("invalid_identification", "NIT invalido", 400));

    const req = new Request("http://localhost/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("invalid_identification");
    expect(json.error.message).toBe("NIT invalido");
  });

  it("returns 429 for a Siigo rate-limit error", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("requests_limit", "Límite excedido.", 429));

    const req = new Request("http://localhost/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe("requests_limit");
  });

  it("returns 502 for a status-less Siigo error (network failure)", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("service_unavailable", "Network failure while reaching the Siigo API."));

    const req = new Request("http://localhost/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error.code).toBe("service_unavailable");
  });
});
