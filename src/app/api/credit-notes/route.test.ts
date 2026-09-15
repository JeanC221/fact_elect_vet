import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { siigoCreditNoteSchema, toCreditNotePayload } from "@/mappers/creditNote";
import { mockSiigoInvoicePayloads } from "@/mocks/siigo";

const validCreditNote = toCreditNotePayload(
  mockSiigoInvoicePayloads[0],
  { id: "INV-1" },
  "billing_error",
  { documentTypeId: 162 },
);
siigoCreditNoteSchema.parse(validCreditNote); // sanity: fixture itself must be contract-valid

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

vi.mock("@/services/creditNoteReconciliation", async () => {
  const actual = await vi.importActual<typeof import("@/services/creditNoteReconciliation")>("@/services/creditNoteReconciliation");
  return { ...actual, reconcileCreditNote: vi.fn() };
});

import { POST } from "./route";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { SiigoApiError, submitCreditNote } from "@/services/siigoApi";
import { reconcileCreditNote } from "@/services/creditNoteReconciliation";
import { AmbiguousReconciliationError, ReconciliationTruncatedError } from "@/services/invoiceReconciliation";

import {
  TEST_JWT_SECRET,
  ADMIN_SESSION,
  issueSessionCookie,
  requestWithCookie,
} from "@/test/sessionRequest";

let sessionCookie: string;
beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.SIIGO_RECONCILE_DELAY_MS = "0";
  sessionCookie = await issueSessionCookie(ADMIN_SESSION);
});

function authed(url: string, init: RequestInit = {}) {
  return requestWithCookie(url, sessionCookie, init);
}

function postCreditNote(body: unknown, idemKey = "IDEM-NC-123") {
  return authed("http://localhost/api/credit-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Idempotency-Key": idemKey },
    body: JSON.stringify(body),
  });
}

describe("POST /api/credit-notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockReset();
    // Default: acquireAnnulmentClaim succeeds (row was `emitted`).
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: mockAccessToken, partnerId: mockPartnerId });
  });

  it("acquires the annulment claim BEFORE calling Siigo", async () => {
    vi.mocked(submitCreditNote).mockResolvedValue({ id: "NC-1", cufe: "CUFE-1", status: "Accepted", observations: undefined, invoice: { id: "INV-1" } });

    const req = postCreditNote({ consultationId: CONSULTATION_ID, payload: validCreditNote });
    await POST(req);

    const [firstSql] = queryMock.mock.calls[0];
    expect(firstSql).toContain("status = 'annulling'");
    expect(submitCreditNote).toHaveBeenCalled();
  });

  it("returns the Siigo response and marks the claim annulled on success", async () => {
    const siigoResponse = { id: "NC-1", cufe: "CUFE-NC-1", status: "Accepted" as const, observations: undefined, invoice: { id: "INV-1" } };
    vi.mocked(submitCreditNote).mockResolvedValue(siigoResponse);

    const res = await POST(postCreditNote({ consultationId: CONSULTATION_ID, payload: validCreditNote }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(siigoResponse);
    expect(submitCreditNote).toHaveBeenCalledWith(validCreditNote, mockAccessToken, mockPartnerId, "IDEM-NC-123");
    const [, secondParams] = queryMock.mock.calls[1];
    expect(queryMock.mock.calls[1][0]).toContain("status = 'annulled'");
    expect(secondParams).toEqual([CONSULTATION_ID, "NC-1"]);
  });

  it("returns 409 annulment_not_allowed when the claim cannot move to annulling (already annulling/annulled/pending/unknown)", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // acquireAnnulmentClaim: no row updated
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ consultation_id: CONSULTATION_ID, status: "annulling", invoice_id: "INV-1", claimed_at: new Date(), last_error: null }] });

    const res = await POST(postCreditNote({ consultationId: CONSULTATION_ID, payload: validCreditNote }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("annulment_not_allowed");
    expect(submitCreditNote).not.toHaveBeenCalled();
  });

  it("returns 400 when consultationId is missing, so a credit note can never orphan a blocked consultation", async () => {
    const res = await POST(postCreditNote(validCreditNote));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("invalid_payload");
    expect(submitCreditNote).not.toHaveBeenCalled();
  });

  it("returns 400 for a Zod-invalid payload (negative amounts, the old C-8 defect)", async () => {
    const bad = { ...validCreditNote, payments: [{ ...validCreditNote.payments[0], value: -1 }] };
    const res = await POST(postCreditNote({ consultationId: CONSULTATION_ID, payload: bad }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("invalid_payload");
    expect(submitCreditNote).not.toHaveBeenCalled();
  });

  it("returns 502 with a Spanish message when SiigoAuthError is thrown", async () => {
    vi.mocked(getSiigoAccessToken).mockRejectedValue(new SiigoAuthError("missing_credentials", "SIIGO_USERNAME no configurada."));

    const res = await POST(postCreditNote({ consultationId: CONSULTATION_ID, payload: validCreditNote }));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error.code).toBe("missing_credentials");
    expect(json.error.message).not.toContain("SIIGO_USERNAME");
  });

  describe("provable 4xx failure (nothing created)", () => {
    it("releases the annulment claim back to `emitted` and returns Siigo's error", async () => {
      vi.mocked(submitCreditNote).mockRejectedValue(new SiigoApiError("invalid_reference", "invoice no encontrado", 400));

      const res = await POST(postCreditNote({ consultationId: CONSULTATION_ID, payload: validCreditNote }));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error.code).toBe("invalid_reference");
      const releaseCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("SET status = 'emitted'"));
      expect(releaseCall).toBeDefined();
      expect(releaseCall?.[1]).toEqual([CONSULTATION_ID]);
      expect(reconcileCreditNote).not.toHaveBeenCalled();
    });

    it("routes duplicated_document into reconciliation (not into 'provably nothing') and reports the existing credit note", async () => {
      vi.mocked(submitCreditNote).mockRejectedValue(new SiigoApiError("duplicated_document", "Ya existe.", 400));
      const existing = { id: "NC-DUP", cufe: "CUFE-DUP", status: "Accepted" as const, observations: undefined, invoice: { id: "INV-1" } };
      vi.mocked(reconcileCreditNote).mockResolvedValue(existing);

      const res = await POST(postCreditNote({ consultationId: CONSULTATION_ID, payload: validCreditNote }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(existing);
      const releaseCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("SET status = 'emitted'"));
      expect(releaseCall).toBeUndefined();
    });
  });

  describe("ambiguous failure (timeout / 5xx) — reconciliation by invoice GUID", () => {
    it("reports success when reconciliation finds the credit note Siigo actually created", async () => {
      vi.mocked(submitCreditNote).mockRejectedValue(new SiigoApiError("service_unavailable", "Network failure."));
      const reconciled = { id: "NC-RECONCILED", cufe: "CUFE-R", status: "Accepted" as const, observations: undefined, invoice: { id: "INV-1" } };
      vi.mocked(reconcileCreditNote).mockResolvedValue(reconciled);

      const res = await POST(postCreditNote({ consultationId: CONSULTATION_ID, payload: validCreditNote }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(reconciled);
      expect(reconcileCreditNote).toHaveBeenCalledWith(validCreditNote.invoice, mockAccessToken, mockPartnerId);
      const annulCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("status = 'annulled'"));
      expect(annulCall?.[1]).toEqual([CONSULTATION_ID, "NC-RECONCILED"]);
    });

    it("releases the claim and surfaces the original error when reconciliation confirms genuine absence", async () => {
      const original = new SiigoApiError("service_unavailable", "Network failure.");
      vi.mocked(submitCreditNote).mockRejectedValue(original);
      vi.mocked(reconcileCreditNote).mockResolvedValue(null);

      const res = await POST(postCreditNote({ consultationId: CONSULTATION_ID, payload: validCreditNote }));
      const json = await res.json();

      expect(res.status).toBe(502);
      expect(json.error.code).toBe("service_unavailable");
      const releaseCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("SET status = 'emitted'"));
      expect(releaseCall?.[1]).toEqual([CONSULTATION_ID]);
    });

    it("leaves the claim `annulling` (does not release, does not mark annulled) when reconciliation ITSELF fails", async () => {
      vi.mocked(submitCreditNote).mockRejectedValue(new SiigoApiError("service_unavailable", "Network failure."));
      vi.mocked(reconcileCreditNote).mockRejectedValue(new SiigoApiError("service_unavailable", "No se pudo verificar."));

      const res = await POST(postCreditNote({ consultationId: CONSULTATION_ID, payload: validCreditNote }));

      expect(res.status).toBe(502);
      const releaseCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("SET status = 'emitted'"));
      const annulCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("SET status = 'annulled'"));
      expect(releaseCall).toBeUndefined();
      expect(annulCall).toBeUndefined();
    });

    it("returns 409 ambiguous_reconciliation without releasing the claim when more than one credit note matches", async () => {
      vi.mocked(submitCreditNote).mockRejectedValue(new SiigoApiError("service_unavailable", "Network failure."));
      vi.mocked(reconcileCreditNote).mockRejectedValue(new AmbiguousReconciliationError(2));

      const res = await POST(postCreditNote({ consultationId: CONSULTATION_ID, payload: validCreditNote }));
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.error.code).toBe("ambiguous_reconciliation");
      const releaseCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("SET status = 'emitted'"));
      expect(releaseCall).toBeUndefined();
    });

    it("returns 409 reconciliation_truncated without releasing the claim", async () => {
      vi.mocked(submitCreditNote).mockRejectedValue(new SiigoApiError("service_unavailable", "Network failure."));
      vi.mocked(reconcileCreditNote).mockRejectedValue(new ReconciliationTruncatedError(5));

      const res = await POST(postCreditNote({ consultationId: CONSULTATION_ID, payload: validCreditNote }));
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.error.code).toBe("reconciliation_truncated");
    });
  });

  it("still reports success when the credit note is stamped but marking the claim annulled fails — the document exists", async () => {
    vi.mocked(submitCreditNote).mockResolvedValue({ id: "NC-10", cufe: "CUDE-10", status: "Accepted" as const, observations: undefined, invoice: { id: "INV-1" } });
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // acquireAnnulmentClaim succeeds
    queryMock.mockRejectedValueOnce(new Error("connection terminated")); // markClaimAnnulled fails

    const res = await POST(postCreditNote({ consultationId: CONSULTATION_ID, payload: validCreditNote }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.id).toBe("NC-10");
  });
});
