import { describe, it, expect } from "vitest";
import {
  MissingCreditNoteSettingError,
  toCreditNotePayload,
  siigoCreditNoteSchema,
  siigoCreditNoteResponseSchema,
  siigoCreditNoteItemSchema,
  buildAnnulmentObservations,
  ANNULMENT_REASONS,
  ANNULMENT_DIAN_REASON,
} from "@/mappers/creditNote";
import { mockSiigoInvoicePayloads } from "@/mocks/siigo";

const original = mockSiigoInvoicePayloads[0];
const INVOICE_ID = "302580df-838b-4c1e-9e1a-abc123";

describe("toCreditNotePayload", () => {
  it("throws MissingCreditNoteSettingError when documentTypeId is not configured", () => {
    expect(() => toCreditNotePayload(original, { id: INVOICE_ID }, "billing_error")).toThrow(
      MissingCreditNoteSettingError,
    );
  });

  it("links to the original invoice by GUID under `invoice`, never `base_document`", () => {
    const cn = toCreditNotePayload(original, { id: INVOICE_ID }, "billing_error", { documentTypeId: 162 });
    expect(cn.invoice).toBe(INVOICE_ID);
    expect(cn).not.toHaveProperty("base_document");
  });

  it("never sends customer or seller — the invoice already exists in Siigo Nube", () => {
    const cn = toCreditNotePayload(original, { id: INVOICE_ID }, "billing_error", { documentTypeId: 162 });
    expect(cn).not.toHaveProperty("customer");
    expect(cn).not.toHaveProperty("seller");
  });

  it("never sends `total` — it is a response-only field per the real Siigo contract", () => {
    const cn = toCreditNotePayload(original, { id: INVOICE_ID }, "billing_error", { documentTypeId: 162 });
    expect(cn).not.toHaveProperty("total");
  });

  it("includes `date` as YYYY-MM-DD, which was entirely absent before", () => {
    const cn = toCreditNotePayload(original, { id: INVOICE_ID }, "billing_error", { documentTypeId: 162 });
    expect(cn.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("always sends DIAN reason 2 (full annulment), regardless of the staff-picked UI reason", () => {
    for (const { value } of ANNULMENT_REASONS) {
      const cn = toCreditNotePayload(original, { id: INVOICE_ID }, value, { documentTypeId: 162 });
      expect(cn.reason).toBe(ANNULMENT_DIAN_REASON);
      expect(cn.reason).toBe(2);
    }
  });

  it("preserves the staff-picked reason in `observations`, not on the wire `reason`", () => {
    const cn = toCreditNotePayload(original, { id: INVOICE_ID }, "duplicate_invoice", { documentTypeId: 162 });
    expect(cn.observations).toBe(buildAnnulmentObservations("duplicate_invoice"));
    expect(cn.observations).toContain("Factura duplicada");
  });

  it("mirrors item prices POSITIVE — the exact inverse of the old (negated) mapper", () => {
    const cn = toCreditNotePayload(original, { id: INVOICE_ID }, "billing_error", { documentTypeId: 162 });
    for (const item of cn.items) {
      const p = item.price ?? item.taxed_price ?? -1;
      expect(p).toBeGreaterThan(0);
    }
  });

  it("mirrors payment values POSITIVE", () => {
    const cn = toCreditNotePayload(original, { id: INVOICE_ID }, "billing_error", { documentTypeId: 162 });
    for (const payment of cn.payments) {
      expect(payment.value).toBeGreaterThan(0);
    }
  });

  it("mirrors taxed_price when the original invoice used it, instead of switching fields", () => {
    const taxedOriginal = { ...original, items: [{ ...original.items[0], price: undefined, taxed_price: 95000 }] };
    const cn = toCreditNotePayload(taxedOriginal, { id: INVOICE_ID }, "billing_error", { documentTypeId: 162 });
    expect(cn.items[0].taxed_price).toBe(95000);
    expect(cn.items[0].price).toBeUndefined();
  });

  it("mirrors item taxes so the reversal cancels the IVA and not just the net", () => {
    const withTax = { ...original, items: [{ ...original.items[0], taxes: [{ id: 1 }] }] };
    const cn = toCreditNotePayload(withTax, { id: INVOICE_ID }, "billing_error", { documentTypeId: 162 });
    expect(cn.items[0].taxes).toEqual([{ id: 1 }]);
  });

  it("omits taxes on the credit note when the invoice line had none", () => {
    const cn = toCreditNotePayload(original, { id: INVOICE_ID }, "billing_error", { documentTypeId: 162 });
    expect(cn.items[0]).not.toHaveProperty("taxes");
  });

  it("overrides the document type via options.documentTypeId — never a hardcoded default", () => {
    const cn = toCreditNotePayload(original, { id: INVOICE_ID }, "billing_error", { documentTypeId: 9999 });
    expect(cn.document.id).toBe(9999);
  });
});

describe("siigoCreditNoteSchema", () => {
  const valid = () =>
    toCreditNotePayload(original, { id: INVOICE_ID }, "billing_error", { documentTypeId: 162 });

  it("parses a valid credit note payload built by the mapper", () => {
    expect(() => siigoCreditNoteSchema.parse(valid())).not.toThrow();
  });

  it("rejects a negative item price (C-8's core defect)", () => {
    const cn = valid();
    cn.items[0].price = -(cn.items[0].price ?? 1);
    expect(() => siigoCreditNoteSchema.parse(cn)).toThrow();
  });

  it("rejects a negative payment value", () => {
    const cn = valid();
    cn.payments[0].value = -cn.payments[0].value;
    expect(() => siigoCreditNoteSchema.parse(cn)).toThrow();
  });

  it("rejects a `reason` sent as a string (the old contract's mistake)", () => {
    const cn = { ...valid(), reason: "billing_error" as unknown as number };
    expect(() => siigoCreditNoteSchema.parse(cn)).toThrow();
  });

  it("rejects reason 0 and reason 7 — outside the range both Siigo lists agree on", () => {
    expect(() => siigoCreditNoteSchema.parse({ ...valid(), reason: 0 })).toThrow();
    expect(() => siigoCreditNoteSchema.parse({ ...valid(), reason: 7 })).toThrow();
  });

  it("rejects mismatched items/payments totals", () => {
    const cn = valid();
    cn.payments[0].value = cn.payments[0].value + 1;
    expect(() => siigoCreditNoteSchema.parse(cn)).toThrow();
  });

  it("rejects an empty items array", () => {
    const cn = valid();
    cn.items = [];
    expect(() => siigoCreditNoteSchema.parse(cn)).toThrow();
  });

  it("rejects a missing invoice GUID", () => {
    const cn = valid() as Partial<ReturnType<typeof valid>>;
    delete cn.invoice;
    expect(() => siigoCreditNoteSchema.parse(cn)).toThrow();
  });

  it("tolerates extra fields (contract-of-tolerance: schema never rejects unknown fields)", () => {
    const cn = { ...valid(), someFutureField: "x" };
    expect(() => siigoCreditNoteSchema.parse(cn)).not.toThrow();
  });
});

describe("siigoCreditNoteItemSchema — description is sanitised like the invoice's", () => {
  const base = { code: "CONS-01", quantity: 1, price: 1000 };

  it("strips an apostrophe from a client-supplied credit note description", () => {
    const parsed = siigoCreditNoteItemSchema.parse({ ...base, description: "Cliente's consulta" });
    expect(parsed.description).not.toContain("'");
  });

  it("still rejects an empty description after sanitisation", () => {
    expect(() => siigoCreditNoteItemSchema.parse({ ...base, description: "   " })).toThrow();
  });
});

describe("siigoCreditNoteResponseSchema", () => {
  it("reads cufe/cude/status from under `stamp`, never the root", () => {
    const raw = { id: "NC-1", stamp: { cufe: "CUFE-1", cude: "CUDE-1", status: "Accepted" } };
    const parsed = siigoCreditNoteResponseSchema.parse(raw);
    expect(parsed.cufe).toBe("CUFE-1");
    expect(parsed.status).toBe("Accepted");
  });

  it("keeps the echoed `invoice: {id, name}` — the anchor for credit-note reconciliation", () => {
    const raw = { id: "NC-1", invoice: { id: INVOICE_ID, name: "FV-1-1" }, stamp: { cufe: "C", status: "Accepted" } };
    const parsed = siigoCreditNoteResponseSchema.parse(raw);
    expect(parsed.invoice).toEqual({ id: INVOICE_ID, name: "FV-1-1" });
  });

  it("defaults cufe/status to empty/Draft when Siigo returns no populated stamp, mirroring invoices", () => {
    const parsed = siigoCreditNoteResponseSchema.parse({ id: "NC-1" });
    expect(parsed.cufe).toBe("");
    expect(parsed.status).toBe("Draft");
  });

  it("still requires the credit-note id", () => {
    expect(() => siigoCreditNoteResponseSchema.parse({ status: "Accepted" })).toThrow();
  });
});

describe("ANNULMENT_REASONS", () => {
  it("has exactly 5 reasons with non-empty labels", () => {
    expect(ANNULMENT_REASONS).toHaveLength(5);
    for (const r of ANNULMENT_REASONS) expect(r.label.length).toBeGreaterThan(0);
  });
});
