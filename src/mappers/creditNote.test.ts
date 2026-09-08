import { describe, expect, it } from "vitest";
import { mockSiigoInvoicePayloads } from "@/mocks/siigo";
import {
  ANNULMENT_REASONS,
  siigoCreditNoteItemSchema,
  MissingCreditNoteSettingError,
  siigoCreditNoteResponseSchema,
  siigoCreditNoteSchema,
  toCreditNotePayload,
} from "@/mappers/creditNote";

describe("creditNote mapper", () => {
  const original = mockSiigoInvoicePayloads[0];
  const base = { id: "INV-7751", cufe: "CUFE-abc123def456" };
  /** Every real call site must supply the account's own configured NC document type id — no hardcoded default exists. */
  const withDocType = { documentTypeId: 2379 };

  describe("toCreditNotePayload", () => {
    it("throws MissingCreditNoteSettingError when documentTypeId is not configured", () => {
      expect(() => toCreditNotePayload(original, base, "billing_error")).toThrow(MissingCreditNoteSettingError);
    });

    it("negates item prices, payment amounts, and total", () => {
      const cn = toCreditNotePayload(original, base, "billing_error", withDocType);
      expect(cn.items[0].price).toBe(-original.items[0].price!);
      expect(cn.payments[0].value).toBe(-original.payments[0].value);
      expect(cn.total).toBe(-(original.items[0].price! * original.items[0].quantity));
    });

    it("carries base_document with original invoice id and CUFE", () => {
      const cn = toCreditNotePayload(original, base, "billing_error", withDocType);
      expect(cn.base_document).toEqual(base);
    });

    it("copies customer and item fields; stamp/mail are always true (DIAN Resolución 000042 — a credit note against a stamped invoice is always electronic)", () => {
      const cn = toCreditNotePayload(original, base, "customer_request", withDocType);
      expect(cn.customer).toEqual(original.customer);
      expect(cn.items[0].description).toBe(original.items[0].description);
      expect(cn.items[0].quantity).toBe(original.items[0].quantity);
      expect(cn.stamp.send).toBe(true);
      expect(cn.mail.send).toBe(true);
      expect(cn.reason).toBe("customer_request");
    });

    it("emits document: { id } using the configured credit-note document type — never a hardcoded default", () => {
      const cn = toCreditNotePayload(original, base, "billing_error", { documentTypeId: 2379 });
      expect(cn.document).toEqual({ id: 2379 });
    });

    it("overrides the document type via options.documentTypeId", () => {
      const cn = toCreditNotePayload(original, base, "billing_error", { documentTypeId: 3001 });
      expect(cn.document).toEqual({ id: 3001 });
      expect(() => siigoCreditNoteSchema.parse(cn)).not.toThrow();
    });

    it("keeps customer flat identification (id_type + string identification)", () => {
      const cn = toCreditNotePayload(original, base, "billing_error", withDocType);
      expect(cn.customer.id_type).toBe(original.customer.id_type);
      expect(typeof cn.customer.identification).toBe("string");
      expect(cn.customer.identification).toBe(original.customer.identification);
    });

    it("reverses payments into { id, value } pairs", () => {
      const cn = toCreditNotePayload(original, base, "billing_error", withDocType);
      expect(cn.payments).toEqual(original.payments.map((p) => ({ id: p.id, value: -p.value })));
    });
  });

  describe("siigoCreditNoteSchema", () => {
    it("parses a valid credit note payload", () => {
      const cn = toCreditNotePayload(original, base, "billing_error", withDocType);
      const parsed = siigoCreditNoteSchema.parse(cn);
      expect(parsed.base_document).toEqual(cn.base_document);
      expect(parsed.customer).toEqual(cn.customer);
      expect(parsed.items).toHaveLength(cn.items.length);
      expect(parsed.items[0].price).toBe(cn.items[0].price);
      expect(parsed.payments[0].value).toBe(cn.payments[0].value);
      expect(parsed.total).toBe(cn.total);
      expect(parsed.reason).toBe(cn.reason);
    });

    it("rejects mismatched totals (DIAN invalid_total_payments guard)", () => {
      const cn = toCreditNotePayload(original, base, "billing_error", withDocType);
      const bad = { ...cn, total: -1 };
      expect(() => siigoCreditNoteSchema.parse(bad)).toThrow();
    });

    it("rejects an empty items array", () => {
      const cn = toCreditNotePayload(original, base, "billing_error", withDocType);
      const bad = { ...cn, items: [] };
      expect(() => siigoCreditNoteSchema.parse(bad)).toThrow();
    });

    it("rejects a missing base_document CUFE", () => {
      const cn = toCreditNotePayload(original, base, "billing_error", withDocType);
      const bad = { ...cn, base_document: { id: "INV-1", cufe: "" } };
      expect(() => siigoCreditNoteSchema.parse(bad)).toThrow();
    });

    it("rejects a payload without the credit-note document type", () => {
      const cn = toCreditNotePayload(original, base, "billing_error", withDocType);
      const bad: Record<string, unknown> = { ...cn };
      delete bad.document;
      expect(() => siigoCreditNoteSchema.parse(bad)).toThrow();
    });
  });

  describe("siigoCreditNoteResponseSchema", () => {
    it("parses an accepted credit note response", () => {
      const res = { id: "NC-7751", cufe: "NCUFE-abc", status: "Accepted" as const };
      expect(siigoCreditNoteResponseSchema.parse(res)).toEqual(res);
    });
  });

  describe("ANNULMENT_REASONS", () => {
    it("has exactly 5 reasons with non-empty labels", () => {
      expect(ANNULMENT_REASONS).toHaveLength(5);
      for (const r of ANNULMENT_REASONS) {
        expect(r.value).toBeTruthy();
        expect(r.label.trim().length).toBeGreaterThan(0);
      }
    });
  });

  it("mirrors taxed_price when the original invoice used it, instead of switching fields", () => {
    // Switching price<->taxed_price between invoice and credit note changes how
    // Siigo computes tax on the reversal, leaving a residual DIAN balance.
    const taxedOriginal = {
      ...original,
      items: original.items.map(({ price, ...rest }) => ({ ...rest, taxed_price: price! })),
    };
    const cn = toCreditNotePayload(taxedOriginal, base, "billing_error", withDocType);
    expect(cn.items[0].taxed_price).toBe(-taxedOriginal.items[0].taxed_price);
    expect(cn.items[0].price).toBeUndefined();
  });

  it("mirrors the item taxes, so the reversal cancels the IVA and not just the net", () => {
    const taxedOriginal = {
      ...original,
      items: original.items.map((i) => ({ ...i, taxes: [{ id: 1270 }] })),
    };
    const cn = toCreditNotePayload(taxedOriginal, base, "billing_error", withDocType);
    expect(cn.items[0].taxes).toEqual([{ id: 1270 }]);
  });

  it("omits taxes on the credit note when the invoice line had none", () => {
    const cn = toCreditNotePayload(original, base, "billing_error", withDocType);
    expect(cn.items[0].taxes).toBeUndefined();
  });
});

/**
 * Description sanitisation parity with the invoice schema.
 *
 * `siigoInvoiceItemSchema.description` is `sanitizedText({ max: 200 })`;
 * `siigoCreditNoteItemSchema.description` was a bare `z.string()`. That gap is
 * reachable from the network: `POST /api/credit-notes` parses
 * `siigoCreditNoteSchema` straight off the client-supplied request body, so the
 * payload does NOT have to come from `buildCreditNote` and its already-sanitised
 * invoice. Siigo publishes an `invalid_description` error whose character class
 * excludes the apostrophe and control characters, so an unsanitised description
 * is rejected at the API — after the Idempotency-Key has been spent.
 */
describe("siigoCreditNoteItemSchema — description is sanitised like the invoice's", () => {
  const baseItem = { code: "CONS-01", quantity: 1, taxed_price: -50000 };

  it("strips an apostrophe from a client-supplied credit note description", () => {
    const parsed = siigoCreditNoteItemSchema.parse({
      ...baseItem,
      description: "Consulta d'urgencia",
    });
    expect(parsed.description).not.toMatch(/['\u2018\u2019]/);
  });

  it("strips smart quotes without merging adjacent words", () => {
    const parsed = siigoCreditNoteItemSchema.parse({
      ...baseItem,
      description: "Vacuna \u201Ctriple\u201D felina",
    });
    expect(parsed.description).toBe("Vacuna triple felina");
  });

  it("strips ASCII control characters", () => {
    const parsed = siigoCreditNoteItemSchema.parse({
      ...baseItem,
      description: "Control\u0000post\u001Foperatorio",
    });
    expect(parsed.description).toBe("Control post operatorio");
  });

  it("keeps Spanish accents and ñ, which Siigo's published class allows", () => {
    const parsed = siigoCreditNoteItemSchema.parse({
      ...baseItem,
      description: "Extracción de uña — canino",
    });
    expect(parsed.description).toContain("Extracción");
    expect(parsed.description).toContain("uña");
  });

  it("still rejects an empty description after sanitisation", () => {
    expect(() =>
      siigoCreditNoteItemSchema.parse({ ...baseItem, description: "''" }),
    ).toThrow();
  });
});
