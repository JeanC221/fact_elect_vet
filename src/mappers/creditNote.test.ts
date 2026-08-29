import { describe, expect, it } from "vitest";
import { mockSiigoInvoicePayloads } from "@/mocks/siigo";
import {
  ANNULMENT_REASONS,
  siigoCreditNoteResponseSchema,
  siigoCreditNoteSchema,
  toCreditNotePayload,
} from "@/mappers/creditNote";

describe("creditNote mapper", () => {
  const original = mockSiigoInvoicePayloads[0];
  const base = { id: "INV-7751", cufe: "CUFE-abc123def456" };

  describe("toCreditNotePayload", () => {
    it("negates item prices, payment amounts, and total", () => {
      const cn = toCreditNotePayload(original, base, "billing_error");
      expect(cn.items[0].price).toBe(-original.items[0].price);
      expect(cn.payments[0].value).toBe(-original.payments[0].value);
      expect(cn.total).toBe(-(original.items[0].price * original.items[0].quantity));
    });

    it("carries base_document with original invoice id and CUFE", () => {
      const cn = toCreditNotePayload(original, base, "billing_error");
      expect(cn.base_document).toEqual(base);
    });

    it("copies customer and item fields, defaults stamp/mail to false", () => {
      const cn = toCreditNotePayload(original, base, "customer_request");
      expect(cn.customer).toEqual(original.customer);
      expect(cn.items[0].description).toBe(original.items[0].description);
      expect(cn.items[0].quantity).toBe(original.items[0].quantity);
      expect(cn.stamp.send).toBe(false);
      expect(cn.mail.send).toBe(false);
      expect(cn.reason).toBe("customer_request");
    });
  });

  describe("siigoCreditNoteSchema", () => {
    it("parses a valid credit note payload", () => {
      const cn = toCreditNotePayload(original, base, "billing_error");
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
      const cn = toCreditNotePayload(original, base, "billing_error");
      const bad = { ...cn, total: -1 };
      expect(() => siigoCreditNoteSchema.parse(bad)).toThrow();
    });

    it("rejects an empty items array", () => {
      const cn = toCreditNotePayload(original, base, "billing_error");
      const bad = { ...cn, items: [] };
      expect(() => siigoCreditNoteSchema.parse(bad)).toThrow();
    });

    it("rejects a missing base_document CUFE", () => {
      const cn = toCreditNotePayload(original, base, "billing_error");
      const bad = { ...cn, base_document: { id: "INV-1", cufe: "" } };
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
});