import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
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

const CONSULTATION_ID = "provet-consult-4242";

const mockAccessToken = "tok-live-123";
const mockPartnerId = "PARTNER-LIVE";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@/services/db", () => ({ getPool: () => ({ query: queryMock }) }));

vi.mock("@/services/siigoAuth", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoAuth")>("@/services/siigoAuth");
  return { ...actual, getSiigoAccessToken: vi.fn() };
});

vi.mock("@/services/siigoApi", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoApi")>("@/services/siigoApi");
  return { ...actual, submitCreditNote: vi.fn() };
});

import { POST } from "./route";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { SiigoApiError, submitCreditNote } from "@/services/siigoApi";

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

describe("POST /api/credit-notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: mockAccessToken, partnerId: mockPartnerId });
  });

  it("returns the Siigo response on success", async () => {
    const siigoResponse = { id: "NC-1", cufe: "CUFE-NC-1", status: "Accepted" as const, observations: undefined };
    vi.mocked(submitCreditNote).mockResolvedValue(siigoResponse);

    const req = authed("http://localhost/api/credit-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Idempotency-Key": "IDEM-NC-123" },
      body: JSON.stringify({ consultationId: CONSULTATION_ID, payload: validCreditNote }),
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
    const req = authed("http://localhost/api/credit-notes", {
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

    const req = authed("http://localhost/api/credit-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consultationId: CONSULTATION_ID, payload: validCreditNote }),
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

    const req = authed("http://localhost/api/credit-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consultationId: CONSULTATION_ID, payload: validCreditNote }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("invalid_reference");
    expect(json.error.message).toBe("base_document.id no encontrado");
  });

  it("returns 429 for a Siigo rate-limit error", async () => {
    vi.mocked(submitCreditNote).mockRejectedValue(new SiigoApiError("requests_limit", "Límite excedido.", 429));

    const req = authed("http://localhost/api/credit-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consultationId: CONSULTATION_ID, payload: validCreditNote }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe("requests_limit");
  });

  it("returns 502 for a status-less Siigo error (network failure)", async () => {
    vi.mocked(submitCreditNote).mockRejectedValue(new SiigoApiError("service_unavailable", "Network failure while reaching the Siigo API."));

    const req = authed("http://localhost/api/credit-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consultationId: CONSULTATION_ID, payload: validCreditNote }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error.code).toBe("service_unavailable");
  });

  it("marks the emission claim as annulled so the consultation can be billed again", async () => {
    vi.mocked(submitCreditNote).mockResolvedValue({ id: "NC-9", cufe: "CUDE-9", status: "Accepted" as const, observations: undefined });

    const req = authed("http://localhost/api/credit-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consultationId: CONSULTATION_ID, payload: validCreditNote }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("status = 'annulled'");
    expect(params).toEqual([CONSULTATION_ID, "NC-9"]);
  });

  it("returns 400 when consultationId is missing, so a credit note can never orphan a blocked consultation", async () => {
    const req = authed("http://localhost/api/credit-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validCreditNote),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_payload");
    expect(submitCreditNote).not.toHaveBeenCalled();
  });

  it("still reports success when the credit note is stamped but the claim update fails — the document exists", async () => {
    vi.mocked(submitCreditNote).mockResolvedValue({ id: "NC-10", cufe: "CUDE-10", status: "Accepted" as const, observations: undefined });
    queryMock.mockRejectedValue(new Error("connection terminated"));

    const req = authed("http://localhost/api/credit-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consultationId: CONSULTATION_ID, payload: validCreditNote }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("NC-10");
  });
});
