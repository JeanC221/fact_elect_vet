import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { siigoCreditNoteSchema } from "@/mappers/creditNote";
import { mockSiigoInvoicePayloads } from "@/mocks/siigo";

const validCreditNote = siigoCreditNoteSchema.parse({
  document: { id: 162 },
  base_document: { id: "INV-1", cufe: "CUFE-ABC" },
  customer: mockSiigoInvoicePayloads[0].customer,
  items: [{ code: "CONS-01", description: "Consulta veterinaria", quantity: 1, price: -59500 }],
  payments: [{ id: 5636, value: -59500 }],
  total: -59500,
  reason: "billing_error",
  stamp: { send: true },
  mail: { send: true },
});

const mockAccessToken = "tok-live-123";
const mockPartnerId = "PARTNER-LIVE";

vi.mock("@/services/siigoAuth", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoAuth")>("@/services/siigoAuth");
  return { ...actual, getSiigoAccessToken: vi.fn() };
});

vi.mock("@/services/siigoApi", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoApi")>("@/services/siigoApi");
  return { ...actual, submitCreditNote: vi.fn() };
});

import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { SiigoApiError, submitCreditNote } from "@/services/siigoApi";

describe("POST /api/credit-notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: mockAccessToken, partnerId: mockPartnerId });
  });

  it("returns the Siigo response on success", async () => {
    const siigoResponse = { id: "NC-1", cufe: "CUFE-NC-1", status: "Accepted" as const, observations: undefined };
    vi.mocked(submitCreditNote).mockResolvedValue(siigoResponse);

    const req = new Request("http://localhost/api/credit-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Idempotency-Key": "IDEM-NC-123" },
      body: JSON.stringify(validCreditNote),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(siigoResponse);
    // Never receives an empty accessToken/partnerId — proves the browser-direct-call bug is fixed.
    expect(submitCreditNote).toHaveBeenCalledWith(validCreditNote, mockAccessToken, mockPartnerId, "IDEM-NC-123");
  });

  it("returns 400 for a Zod-invalid payload", async () => {
    const bad = { ...validCreditNote, total: 123456 }; // breaks the items/payments/total refine
    const req = new Request("http://localhost/api/credit-notes", {
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

    const req = new Request("http://localhost/api/credit-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validCreditNote),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error.code).toBe("missing_credentials");
    expect(json.error.message).toContain("Error de autenticacion");
    expect(json.error.message).not.toContain("SIIGO_USERNAME");
  });

  it("returns 400 with a structured error when Siigo rejects with 400", async () => {
    vi.mocked(submitCreditNote).mockRejectedValue(new SiigoApiError("invalid_reference", "base_document.id no encontrado", 400));

    const req = new Request("http://localhost/api/credit-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validCreditNote),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("invalid_reference");
    expect(json.error.message).toBe("base_document.id no encontrado");
  });

  it("returns 429 for a Siigo rate-limit error", async () => {
    vi.mocked(submitCreditNote).mockRejectedValue(new SiigoApiError("requests_limit", "Límite excedido.", 429));

    const req = new Request("http://localhost/api/credit-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validCreditNote),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe("requests_limit");
  });

  it("returns 502 for a status-less Siigo error (network failure)", async () => {
    vi.mocked(submitCreditNote).mockRejectedValue(new SiigoApiError("service_unavailable", "Network failure while reaching the Siigo API."));

    const req = new Request("http://localhost/api/credit-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validCreditNote),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error.code).toBe("service_unavailable");
  });
});