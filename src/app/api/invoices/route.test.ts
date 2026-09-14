import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { NextRequest } from "next/server";
import { siigoInvoicePayloadSchema } from "@/schemas/siigo";
import { mockSiigoInvoicePayloads } from "@/mocks/siigo";

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

/**
 * The mock fixture's line carries `price` (VAT-exclusive). The mapper never
 * emits that — `provetToSiigo.ts` always sends `taxed_price`, because Provet's
 * `sum_total` is already VAT-inclusive — and the C-11/D check in the route
 * refuses a `price`-based payload rather than comparing a VAT-exclusive sum
 * against a VAT-inclusive Provet header. So the line is overridden here to
 * match what production actually sends. The mock itself is left alone: it is
 * shared with the credit-note tests, which are session 3 territory.
 */
const validPayload = siigoInvoicePayloadSchema.parse({
  ...mockSiigoInvoicePayloads[0],
  items: [{ code: "SERV-CG-01", description: "Consulta General Veterinaria", quantity: 1, taxed_price: 80000 }],
});
/** Provet's `total_with_vat` for the consultation behind `validPayload`. */
const EXPECTED_TOTAL = 80000;
const CONSULTATION_ID = "provet-consult-9911";

const mockAccessToken = "tok-live-123";
const mockPartnerId = "PARTNER-LIVE";

/**
 * In-memory stand-in for the `invoice_claims` table that reproduces the one
 * property under test: the UNIQUE index on consultation_id. The INSERT branch
 * checks and writes without an intervening await, exactly like a single
 * Postgres statement, so two interleaved requests race the same way they would
 * against the real database. (Port 6543 is unreachable from the test sandbox,
 * so pg is always mocked in this project.)
 */
const { queryMock, claims } = vi.hoisted(() => {
  const claims = new Map<string, { status: string; invoice_id: string | null; claimed_at: Date; last_error: string | null }>();
  const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
    const id = String(params[0] ?? "");
    if (sql.includes("INSERT INTO invoice_claims")) {
      // Mirrors the conditional DO UPDATE: an `annulled` claim is taken over,
      // anything else wins the conflict and blocks the caller.
      const current = claims.get(id);
      if (current && current.status !== "annulled") return { rowCount: 0, rows: [] };
      claims.set(id, { status: "pending", invoice_id: null, claimed_at: new Date(), last_error: null });
      return { rowCount: 1, rows: [{ consultation_id: id }] };
    }
    if (sql.includes("SELECT consultation_id, status")) {
      const row = claims.get(id);
      if (!row) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ consultation_id: id, ...row }] };
    }
    if (sql.includes("status = 'emitted'")) {
      const row = claims.get(id);
      if (row) claims.set(id, { ...row, status: "emitted", invoice_id: String(params[1] ?? "") });
      return { rowCount: row ? 1 : 0, rows: [] };
    }
    if (sql.includes("status = 'unknown'")) {
      const row = claims.get(id);
      if (row) claims.set(id, { ...row, status: "unknown", last_error: String(params[1] ?? "") });
      return { rowCount: row ? 1 : 0, rows: [] };
    }
    if (sql.includes("DELETE FROM invoice_claims")) {
      const existed = claims.delete(id);
      return { rowCount: existed ? 1 : 0, rows: [] };
    }
    throw new Error(`Unexpected SQL in test: ${sql}`);
  });
  return { queryMock, claims };
});

vi.mock("@/services/db", () => ({ getPool: () => ({ query: queryMock }) }));

vi.mock("@/services/siigoAuth", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoAuth")>("@/services/siigoAuth");
  return { ...actual, getSiigoAccessToken: vi.fn() };
});

vi.mock("@/services/invoiceReconciliation", async () => {
  const actual = await vi.importActual<typeof import("@/services/invoiceReconciliation")>("@/services/invoiceReconciliation");
  return { ...actual, reconcileInvoice: vi.fn() };
});

vi.mock("@/services/siigoApi", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoApi")>("@/services/siigoApi");
  return { ...actual, submitInvoice: vi.fn() };
});

import { POST } from "./route";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { SiigoApiError, submitInvoice } from "@/services/siigoApi";
import { reconcileInvoice, AmbiguousReconciliationError, ReconciliationTruncatedError } from "@/services/invoiceReconciliation";


function makeRequest(body: unknown, idempotencyKey?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;
  return authed("http://localhost/api/invoices", { method: "POST", headers, body: JSON.stringify(body) });
}

const validBody = { consultationId: CONSULTATION_ID, expectedTotal: EXPECTED_TOTAL, payload: validPayload };

describe("POST /api/invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claims.clear();
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: mockAccessToken, partnerId: mockPartnerId });
    vi.mocked(reconcileInvoice).mockResolvedValue(null);
    process.env.SIIGO_RECONCILE_DELAY_MS = "0";
  });

  it("returns the Siigo response on success and pins the claim to the emitted invoice", async () => {
    const siigoResponse = { id: "INV-1", number: 123, cufe: "CUFE-123", status: "Accepted" as const, observations: undefined };
    vi.mocked(submitInvoice).mockResolvedValue(siigoResponse);

    const res = await POST(makeRequest(validBody, "IDEMKEY123"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(siigoResponse);
    expect(submitInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ ...validPayload, observations: expect.stringContaining(`Consulta Provet #${CONSULTATION_ID}`) }),
      mockAccessToken, mockPartnerId, "IDEMKEY123",
    );
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "emitted", invoice_id: "INV-1" });
  });

  it("returns 409 and never calls Siigo when the consultation was already invoiced", async () => {
    claims.set(CONSULTATION_ID, { status: "emitted", invoice_id: "INV-EXISTING", claimed_at: new Date(), last_error: null });

    const res = await POST(makeRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("consultation_already_claimed");
    expect(json.error.message).toContain("INV-EXISTING");
    expect(json.error.message).toContain("No se emitió una segunda factura");
    expect(submitInvoice).not.toHaveBeenCalled();
  });

  it("serializes two concurrent requests for the same consultation: exactly one reaches Siigo", async () => {
    let resolveSiigo: ((v: unknown) => void) | undefined;
    const inFlight = new Promise((resolve) => { resolveSiigo = resolve; });
    vi.mocked(submitInvoice).mockImplementation(async () => {
      await inFlight;
      return { id: "INV-RACE", number: 1, cufe: "CUFE-RACE", status: "Accepted" as const, observations: undefined };
    });

    // Both devices fire before either has finished talking to Siigo.
    const first = POST(makeRequest(validBody, "IDEMKEYAAA"));
    const second = POST(makeRequest(validBody, "IDEMKEYBBB"));
    await Promise.resolve();
    resolveSiigo?.(null);

    const [resA, resB] = await Promise.all([first, second]);
    const statuses = [resA.status, resB.status].sort();

    expect(statuses).toEqual([200, 409]);
    expect(submitInvoice).toHaveBeenCalledTimes(1);

    const conflicted = resA.status === 409 ? resA : resB;
    expect((await conflicted.json()).error.code).toBe("consultation_already_claimed");
  });

  it("returns 409 for a later request once the consultation is already emitted", async () => {
    vi.mocked(submitInvoice).mockResolvedValue({ id: "INV-2", number: 2, cufe: "C", status: "Accepted" as const, observations: undefined });
    expect((await POST(makeRequest(validBody))).status).toBe(200);
    expect((await POST(makeRequest(validBody))).status).toBe(409);
    expect(submitInvoice).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for a Zod-invalid payload and takes no claim", async () => {
    const res = await POST(makeRequest({ consultationId: CONSULTATION_ID, expectedTotal: EXPECTED_TOTAL, payload: { ...validPayload, seller: -1 } }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("invalid_payload");
    expect(claims.size).toBe(0);
    expect(submitInvoice).not.toHaveBeenCalled();
  });

  it("returns 400 total_mismatch when the payload lines do not add up to Provet's header total", async () => {
    // Invoice 12 of the live tenant, in the shape it reaches the route:
    // Provet's header says 158.28, the lines built from the filtered rows say
    // 187.50. Neither may be stamped.
    const res = await POST(makeRequest({
      consultationId: CONSULTATION_ID,
      expectedTotal: 158.28,
      payload: siigoInvoicePayloadSchema.parse({
        ...validPayload,
        items: [
          { code: "SERV-CG-01", description: "Consulta general", quantity: 1, taxed_price: 100 },
          { code: "SERV-AMX-01", description: "Amoxicillin 250mg", quantity: 1, taxed_price: 87.5 },
        ],
        payments: [{ id: 5636, value: 187.5 }],
      }),
    }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("total_mismatch");
    expect(json.error.message).toContain("158.28");
    expect(json.error.message).toContain("187.50");
    // The check runs BEFORE the claim is taken and before Siigo is touched:
    // a refused request must not wedge the consultation in `unknown`.
    expect(claims.size).toBe(0);
    expect(submitInvoice).not.toHaveBeenCalled();
  });

  it("catches the mismatch across several lines, not just a single wrong one", async () => {
    const res = await POST(makeRequest({
      consultationId: CONSULTATION_ID,
      expectedTotal: 300,
      payload: siigoInvoicePayloadSchema.parse({
        ...validPayload,
        items: [
          { code: "A", description: "A", quantity: 2, taxed_price: 100 },
          { code: "B", description: "B", quantity: 3, taxed_price: 33.34 },
        ],
        payments: [{ id: 5636, value: 300.02 }],
      }),
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("total_mismatch");
  });

  it("accepts cent-level float drift, because both sides are compared as whole cents", async () => {
    vi.mocked(submitInvoice).mockResolvedValue({ id: "INV-DRIFT", number: 1, cufe: "CUFE-DRIFT", status: "Accepted" as const, observations: undefined });
    const res = await POST(makeRequest({
      consultationId: CONSULTATION_ID,
      expectedTotal: 0.3,
      payload: siigoInvoicePayloadSchema.parse({
        ...validPayload,
        items: [
          { code: "A", description: "A", quantity: 1, taxed_price: 0.1 },
          { code: "B", description: "B", quantity: 1, taxed_price: 0.2 },
        ],
        payments: [{ id: 5636, value: 0.3 }],
      }),
    }));
    expect(res.status).toBe(200);
  });

  it("refuses a VAT-exclusive `price` payload rather than comparing it wrongly", async () => {
    const res = await POST(makeRequest({
      consultationId: CONSULTATION_ID,
      expectedTotal: 80000,
      payload: siigoInvoicePayloadSchema.parse(mockSiigoInvoicePayloads[0]),
    }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("total_mismatch");
    expect(json.error.message).toContain("taxed_price");
    expect(claims.size).toBe(0);
    expect(submitInvoice).not.toHaveBeenCalled();
  });

  it("returns 400 when expectedTotal is missing: the check cannot be skipped by omission", async () => {
    const res = await POST(makeRequest({ consultationId: CONSULTATION_ID, payload: validPayload }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("invalid_payload");
    expect(json.error.message).toContain("expectedTotal");
    expect(claims.size).toBe(0);
    expect(submitInvoice).not.toHaveBeenCalled();
  });

  it("returns 400 when consultationId is missing, so an unlinked invoice can never be stamped", async () => {
    // `expectedTotal` is supplied so the only thing wrong with this request is
    // the missing consultationId — otherwise the test would pass for the wrong
    // reason once the C-11/D field became mandatory.
    const res = await POST(makeRequest({ expectedTotal: EXPECTED_TOTAL, payload: validPayload }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("invalid_payload");
    expect(claims.size).toBe(0);
    expect(submitInvoice).not.toHaveBeenCalled();
  });

  it("returns 502 with a Spanish message when SiigoAuthError is thrown, and takes no claim", async () => {
    vi.mocked(getSiigoAccessToken).mockRejectedValue(new SiigoAuthError("missing_credentials", "SIIGO_USERNAME no configurada."));

    const res = await POST(makeRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error.code).toBe("missing_credentials");
    expect(json.error.message).toContain("Error de autenticacion");
    expect(json.error.message).not.toContain("SIIGO_USERNAME");
    expect(claims.size).toBe(0);
  });

  it("releases the claim on a Siigo 4xx rejection, so staff can correct the data and retry", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("invalid_identification", "NIT invalido", 400));

    const res = await POST(makeRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("invalid_identification");
    expect(json.error.message).toBe("NIT invalido");
    expect(claims.has(CONSULTATION_ID)).toBe(false);
  });

  it("releases the claim on a Siigo rate-limit error (429 creates no document)", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("requests_limit", "Límite excedido.", 429));

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("requests_limit");
    expect(claims.has(CONSULTATION_ID)).toBe(false);
  });

  it("KEEPS the claim as `unknown` on a status-less network failure — a dropped connection is not proof the invoice was not created", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("service_unavailable", "Network failure while reaching the Siigo API."));

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("service_unavailable");
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "unknown" });
  });

  it("KEEPS the claim as `unknown` on a Siigo timeout, and blocks a blind retry with 409", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("request_timeout", "Siigo no respondió en 120s."));

    expect((await POST(makeRequest(validBody))).status).toBe(502);
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "unknown" });

    const retry = await POST(makeRequest(validBody));
    expect(retry.status).toBe(409);
    expect((await retry.json()).error.message).toContain("no se pudo confirmar");
  });

  it("KEEPS the claim as `unknown` when Siigo returns 5xx", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("default", "Siigo request failed with HTTP 500.", 500));

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(500);
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "unknown" });
  });

  it("KEEPS the claim as `unknown` when the Siigo response body fails validation after a successful POST", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new Error("Invalid response shape"));

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(500);
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "unknown" });
  });

  it("lets an ANNULLED consultation be invoiced again — voiding an invoice so a corrected one can be issued is the point of a credit note", async () => {
    claims.set(CONSULTATION_ID, { status: "annulled", invoice_id: "NC-5", claimed_at: new Date(), last_error: null });
    vi.mocked(submitInvoice).mockResolvedValue({ id: "INV-REBILL", number: 9, cufe: "CUFE-9", status: "Accepted" as const, observations: undefined });

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(200);
    expect(submitInvoice).toHaveBeenCalledTimes(1);
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "emitted", invoice_id: "INV-REBILL" });
  });

  it("still blocks a second device while the re-billing of an annulled consultation is in flight", async () => {
    claims.set(CONSULTATION_ID, { status: "annulled", invoice_id: "NC-6", claimed_at: new Date(), last_error: null });
    let resolveSiigo: ((v: unknown) => void) | undefined;
    const inFlight = new Promise((resolve) => { resolveSiigo = resolve; });
    vi.mocked(submitInvoice).mockImplementation(async () => {
      await inFlight;
      return { id: "INV-REBILL-RACE", number: 10, cufe: "C", status: "Accepted" as const, observations: undefined };
    });

    const first = POST(makeRequest(validBody, "IDEMKEYCCC"));
    const second = POST(makeRequest(validBody, "IDEMKEYDDD"));
    await Promise.resolve();
    resolveSiigo?.(null);

    const [resA, resB] = await Promise.all([first, second]);
    expect([resA.status, resB.status].sort()).toEqual([200, 409]);
    expect(submitInvoice).toHaveBeenCalledTimes(1);
  });

  it("reports SUCCESS when Siigo 500s but the document turns out to exist — only the response was lost", async () => {
    // Measured on the Siigo sandbox: ~1 POST in 10 returns HTTP 500 with an
    // identical payload. Without this, 10% of emissions wedge a consultation.
    const stamped = { id: "INV-RECON", number: 42, cufe: "CUFE-R", status: "Accepted" as const, observations: undefined };
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("unhandled_error", "Unhandled error", 500));
    vi.mocked(reconcileInvoice).mockResolvedValue(stamped);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(stamped);
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "emitted", invoice_id: "INV-RECON" });
    expect(submitInvoice).toHaveBeenCalledTimes(1);
  });

  it("retries with a FRESH idempotency key once Siigo confirms nothing was created", async () => {
    // Siigo records an idempotency key even on a failed request and rejects
    // its reuse with 400 documents_service, so the retry must not reuse it.
    vi.mocked(submitInvoice)
      .mockRejectedValueOnce(new SiigoApiError("unhandled_error", "Unhandled error", 500))
      .mockResolvedValueOnce({ id: "INV-2ND", number: 43, cufe: "C", status: "Accepted" as const, observations: undefined });
    vi.mocked(reconcileInvoice).mockResolvedValue(null);

    const res = await POST(makeRequest(validBody, "IDEMKEYFIRST"));

    expect(res.status).toBe(200);
    expect(submitInvoice).toHaveBeenCalledTimes(2);
    const firstKey = vi.mocked(submitInvoice).mock.calls[0][3];
    const secondKey = vi.mocked(submitInvoice).mock.calls[1][3];
    expect(firstKey).toBe("IDEMKEYFIRST");
    expect(secondKey).not.toBe(firstKey);
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "emitted", invoice_id: "INV-2ND" });
  });

  it("keeps the SAME marker on the retry, so the second reconciliation can still find it", async () => {
    vi.mocked(submitInvoice)
      .mockRejectedValueOnce(new SiigoApiError("unhandled_error", "Unhandled error", 500))
      .mockResolvedValueOnce({ id: "INV-2ND", number: 43, cufe: "C", status: "Accepted" as const, observations: undefined });

    await POST(makeRequest(validBody, "IDEMKEYFIRST"));

    const obsA = (vi.mocked(submitInvoice).mock.calls[0][0] as { observations?: string }).observations;
    const obsB = (vi.mocked(submitInvoice).mock.calls[1][0] as { observations?: string }).observations;
    expect(obsA).toBe(obsB);
    expect(obsA).toContain("FEV:IDEMKEYFIRST");
  });

  it("falls back to `unknown` when the retry also fails and the document still cannot be found", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("unhandled_error", "Unhandled error", 500));
    vi.mocked(reconcileInvoice).mockResolvedValue(null);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(500);
    expect(submitInvoice).toHaveBeenCalledTimes(2);
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "unknown" });
  });

  it("does NOT retry when the reconciliation lookup itself fails — a failed check is not evidence of absence", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("unhandled_error", "Unhandled error", 500));
    vi.mocked(reconcileInvoice).mockRejectedValue(new SiigoApiError("service_unavailable", "No se pudo verificar."));

    const res = await POST(makeRequest(validBody));

    expect(submitInvoice).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "unknown" });
  });

  it("returns 409 and blocks when the marker matches more than one document", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("unhandled_error", "Unhandled error", 500));
    vi.mocked(reconcileInvoice).mockRejectedValue(new AmbiguousReconciliationError(2));

    const res = await POST(makeRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("ambiguous_reconciliation");
    expect(json.error.message).toContain("nota crédito");
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "unknown" });
  });

  it("C-7: returns 409 (not a silent retry) when the reconciliation search is truncated — absence is unconfirmed, not proven", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("unhandled_error", "Unhandled error", 500));
    vi.mocked(reconcileInvoice).mockRejectedValue(new ReconciliationTruncatedError(5));

    const res = await POST(makeRequest(validBody));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("reconciliation_truncated");
    // Must NOT read like "the invoice does not exist" — that reading is
    // exactly what caused the double-emission this guard exists to prevent.
    expect(json.error.message).not.toContain("no existe");
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "unknown" });
    expect(submitInvoice).toHaveBeenCalledTimes(1);
  });

  it("never reconciles on a 4xx — Siigo already proved nothing was created", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("invalid_identification", "NIT invalido", 400));

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(400);
    expect(reconcileInvoice).not.toHaveBeenCalled();
    expect(submitInvoice).toHaveBeenCalledTimes(1);
    expect(claims.has(CONSULTATION_ID)).toBe(false);
  });

  it("C-5: RECONCILES instead of failing immediately on `duplicated_document` — that 400 means the OPPOSITE of 'nothing was created'", async () => {
    const existing = { id: "INV-DUP", number: 99, cufe: "CUFE-DUP", status: "Accepted" as const, observations: undefined };
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("duplicated_document", "El documento ya existe.", 400));
    vi.mocked(reconcileInvoice).mockResolvedValue(existing);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(existing);
    expect(reconcileInvoice).toHaveBeenCalled();
    expect(submitInvoice).toHaveBeenCalledTimes(1);
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "emitted", invoice_id: "INV-DUP" });
  });

  it("C-5: parks the claim as `unknown`, NOT released, when `duplicated_document` persists and reconciliation can't find the marker — releasing it would let a receptionist retry and genuinely double-stamp", async () => {
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("duplicated_document", "El documento ya existe.", 400));
    vi.mocked(reconcileInvoice).mockResolvedValue(null);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(400);
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "unknown" });
    expect(claims.has(CONSULTATION_ID)).toBe(true);
  });

  it("C-5: same treatment for `already_exists` — also a 4xx that proves creation, not absence", async () => {
    const existing = { id: "INV-AE", number: 100, cufe: "CUFE-AE", status: "Accepted" as const, observations: undefined };
    vi.mocked(submitInvoice).mockRejectedValue(new SiigoApiError("already_exists", "Ya existe.", 400));
    vi.mocked(reconcileInvoice).mockResolvedValue(existing);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(200);
    expect(claims.get(CONSULTATION_ID)).toMatchObject({ status: "emitted", invoice_id: "INV-AE" });
  });

  it("C-6: a malformed Idempotency-Key is rejected BEFORE the claim is taken — no consultation is left wedged in `unknown` for a request that never touched Siigo", async () => {
    const res = await POST(makeRequest(validBody, "clave-con-guiones"));

    expect(res.status).toBe(400);
    expect(claims.has(CONSULTATION_ID)).toBe(false);
    expect(submitInvoice).not.toHaveBeenCalled();
  });
});
