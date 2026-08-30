import { describe, it, expect } from "vitest";
import {
  provetToSiigoInvoice,
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
};

const opts = (): ProvetToSiigoOptions => ({
  mapping: baseMapping,
  siigoProducts: mockSiigoProducts,
  mode: "sandbox",
});

describe("provetToSiigoInvoice — 2-decimal normalization (toFixed(2))", () => {
  it("normalizes the unit price to 2 decimals (kills float drift) and stays schema-valid", () => {
    const consultation = {
      ...mockConsultations[0],
      items: [{ name: "Svc", code: "SERV-CG-01", quantity: 1, unit_price: 100.123456, tax_rate: 0.19, discount: 0 }],
      subtotal: 100.123456,
      tax_total: 19.023456,
      total: 119.15,
    };
    const result = provetToSiigoInvoice(consultation, mockClients[0], mockPatients[0], opts());
    expect(result.items[0].price).toBe(Number((100.123456 * 1.19).toFixed(2)));
    expect(result.items[0].price).toBe(119.15);
    expect(() => siigoInvoicePayloadSchema.parse(result)).not.toThrow();
  });
});

describe("provetToSiigoInvoice — empty-items fallback", () => {
  it("injects a default fallback item when consultation has 0 items", () => {
    const consultation = { ...mockConsultations[0], items: [], total: 95200, subtotal: 0, tax_total: 0 };
    const result = provetToSiigoInvoice(consultation, mockClients[0], mockPatients[0], opts());
    expect(result.items).toHaveLength(1);
    expect(result.items[0].code).toBe("FALLBACK-CVG-01");
    expect(result.items[0].description).toBe("Consulta Veterinaria General");
    expect(result.items[0].quantity).toBe(1);
    expect(result).not.toHaveProperty("total");
    expect(result.payments[0].value).toBe(95200);
    expect(() => siigoInvoicePayloadSchema.parse(result)).not.toThrow();
  });

  it("injects fallback with unit_price=1 when total is $0", () => {
    const consultation = { ...mockConsultations[0], items: [], total: 0, subtotal: 0, tax_total: 0 };
    const result = provetToSiigoInvoice(consultation, mockClients[0], mockPatients[0], opts());
    expect(result.items).toHaveLength(1);
    expect(result.items[0].code).toBe("FALLBACK-CVG-01");
    expect(result.items[0].price).toBe(1);
    expect(result.payments[0].value).toBe(1);
    expect(() => siigoInvoicePayloadSchema.parse(result)).not.toThrow();
  });

  it("does not alter items when consultation already has items", () => {
    const result = provetToSiigoInvoice(mockConsultations[0], mockClients[0], mockPatients[0], opts());
    expect(result.items).toHaveLength(2);
    expect(result.items[0].code).toBe("SERV-CG-01");
    expect(result).not.toHaveProperty("total");
  });
});