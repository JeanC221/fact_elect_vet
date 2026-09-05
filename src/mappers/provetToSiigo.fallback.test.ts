import { describe, it, expect } from "vitest";
import {
  provetToSiigoInvoice,
  EmptyConsultationError,
  type ProvetToSiigoOptions,
} from "./provetToSiigo";
import type { CatalogMapping } from "@/mappers/catalogMapping";
import { siigoInvoicePayloadSchema } from "@/schemas/siigo";
import { mockConsultations, mockClients, mockPatients } from "@/mocks/provet";
import { mockSiigoProducts } from "@/mocks/siigo";

const baseMapping: CatalogMapping = {
  items: [{ provetCode: "SERV-CG-01", siigoProductId: "PROD-001" }],
  payments: [
    { provetMethod: "Tarjeta Crédito", siigoPaymentTypeId: 5636 },
    { provetMethod: "Efectivo", siigoPaymentTypeId: 10948 },
  ],
  version: 1,
  updatedAt: "2026-08-26T00:00:00.000Z",
  documentTypeId: 2372,
  creditNoteDocumentTypeId: 2379,
  sellerId: 62,
};

const opts = (): ProvetToSiigoOptions => ({
  mapping: baseMapping,
  siigoProducts: mockSiigoProducts,
  mode: "sandbox",
  documentTypeId: 2372,
  sellerId: 62,
});

describe("provetToSiigoInvoice — zero-drift rounding", () => {
  it("rounds the unit price to 2 decimals and stays schema-valid", () => {
    const consultation = {
      ...mockConsultations[0],
      items: [{ name: "Svc", code: "SERV-CG-01", quantity: 1, unit_price: 100.123456, tax_rate: 0.19, discount: 0 }],
      subtotal: 100.123456,
      tax_total: 19.023456,
      total: 119.15,
    };
    const result = provetToSiigoInvoice(consultation, mockClients[0], mockPatients[0], opts());
    const frac = String(result.items[0].price).split(".")[1] ?? "";
    expect(frac.length).toBeLessThanOrEqual(2);
    expect(result.items[0].taxed_price).toBe(119.15);
    expect(() => siigoInvoicePayloadSchema.parse(result)).not.toThrow();
  });
});

describe("provetToSiigoInvoice — empty-items fallback", () => {
  const withFallback = (): ProvetToSiigoOptions => ({ ...opts(), fallbackItemCode: "CONS-GEN-01" });

  it("uses the CONFIGURED fallback code when the consultation has no lines and a real total", () => {
    const consultation = { ...mockConsultations[0], items: [], total: 95200, subtotal: 0, tax_total: 0 };
    const result = provetToSiigoInvoice(consultation, mockClients[0], mockPatients[0], withFallback());
    expect(result.items).toHaveLength(1);
    expect(result.items[0].code).toBe("CONS-GEN-01");
    expect(result.items[0].description).toBe("Consulta Veterinaria General");
    expect(result.items[0].quantity).toBe(1);
    expect(result).not.toHaveProperty("total");
    expect(result.payments[0].value).toBe(95200);
    expect(() => siigoInvoicePayloadSchema.parse(result)).not.toThrow();
  });

  it("REFUSES to emit when the consultation has no lines and no fallback code is configured", () => {
    // The old hardcoded "FALLBACK-CVG-01" was a placeholder that does not
    // exist in the clinic's Siigo catalogue — emitting it produces a legal
    // document referencing a product nobody sells.
    const consultation = { ...mockConsultations[0], items: [], total: 95200, subtotal: 0, tax_total: 0 };
    expect(() => provetToSiigoInvoice(consultation, mockClients[0], mockPatients[0], opts()))
      .toThrow(EmptyConsultationError);
  });

  it("REFUSES to invent $1 when the consultation has no lines and a $0 total", () => {
    // `Math.max(total || 1, 1)` used to fabricate a one-peso invoice.
    const consultation = { ...mockConsultations[0], items: [], total: 0, subtotal: 0, tax_total: 0 };
    expect(() => provetToSiigoInvoice(consultation, mockClients[0], mockPatients[0], withFallback()))
      .toThrow(EmptyConsultationError);
  });

  it("explains the problem in Spanish, for the receptionist who hits it", () => {
    const consultation = { ...mockConsultations[0], items: [], total: 0, subtotal: 0, tax_total: 0 };
    try {
      provetToSiigoInvoice(consultation, mockClients[0], mockPatients[0], withFallback());
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain("Provet");
      expect((err as Error).message).not.toMatch(/undefined|NaN/);
    }
  });

  it("does not alter items when consultation already has items", () => {
    const result = provetToSiigoInvoice(mockConsultations[0], mockClients[0], mockPatients[0], opts());
    expect(result.items).toHaveLength(2);
    expect(result.items[0].code).toBe("SERV-CG-01");
    expect(result).not.toHaveProperty("total");
  });
});