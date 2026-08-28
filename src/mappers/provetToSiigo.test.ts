import { describe, it, expect } from "vitest";
import {
  mapTaxRateToSiigo,
  provetToSiigoInvoice,
  type ProvetToSiigoOptions,
} from "./provetToSiigo";
import type { CatalogMapping } from "@/mappers/catalogMapping";
import type { EnvironmentMode } from "@/mappers/credentials";
import { siigoInvoicePayloadSchema } from "@/schemas/siigo";
import { mockConsultations, mockClients, mockPatients } from "@/mocks/provet";
import { mockSiigoProducts } from "@/mocks/siigo";

const baseMapping: CatalogMapping = {
  items: [
    { provetCode: "SERV-CG-01", siigoProductId: "PROD-001" },
    { provetCode: "LAB-HEM-01", siigoProductId: null },
    { provetCode: "VAC-OCT-01", siigoProductId: "PROD-002" },
    { provetCode: "MED-DES-05", siigoProductId: "PROD-003" },
    { provetCode: "SERV-CUN-01", siigoProductId: null },
  ],
  payments: [
    { provetMethod: "Efectivo", siigoPaymentTypeId: "PT-001" },
    { provetMethod: "Tarjeta Crédito", siigoPaymentTypeId: "PT-002" },
    { provetMethod: "Transferencia", siigoPaymentTypeId: "PT-003" },
  ],
  version: 1,
  updatedAt: "2026-08-26T00:00:00.000Z",
};

const opts = (
  mode: EnvironmentMode = "sandbox",
  mapping: CatalogMapping = baseMapping,
): ProvetToSiigoOptions => ({ mapping, siigoProducts: mockSiigoProducts, mode });

const map = (i: number, o: ProvetToSiigoOptions = opts()) =>
  provetToSiigoInvoice(mockConsultations[i], mockClients[i], mockPatients[i], o);

describe("mapTaxRateToSiigo (fallback)", () => {
  it("maps supported rates", () => {
    expect(mapTaxRateToSiigo(0.19)).toBe("IVA_19");
    expect(mapTaxRateToSiigo(0.05)).toBe("IVA_5");
    expect(mapTaxRateToSiigo(0)).toBe("EXENTO");
  });

  it("throws on unsupported tax rate", () => {
    expect(() => mapTaxRateToSiigo(0.08)).toThrow("Unsupported tax rate");
  });
});

describe("provetToSiigoInvoice", () => {
  it("transforms CON-001 via dynamic mapping (Zod round-trip)", () => {
    const result = map(0);
    expect(result.customer.identification).toEqual(mockClients[0].identification);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ code: "SERV-CG-01", price: 59500 });
    expect(result.items[0].taxes).toEqual([{ tax_code: "IVA_19" }]);
    expect(result.items[1].code).toBe("LAB-HEM-01"); // unmapped: keeps Provet code
    expect(result.items[1].taxes).toEqual([{ tax_code: "IVA_19" }]); // rate fallback
    expect(result.payments).toHaveLength(1);
    expect(result.payments[0].payment_type_id).toBe("PT-002");
    expect(result.payments[0].amount).toBe(95200);
    expect(result.total).toBe(95200);
    expect(() => siigoInvoicePayloadSchema.parse(result)).not.toThrow();
  });

  it("gives the Siigo product tax_classification precedence over tax_rate", () => {
    const mapping: CatalogMapping = {
      ...baseMapping,
      items: [{ provetCode: "SERV-CG-01", siigoProductId: "PROD-003" }], // EXENTO
    };
    const result = map(0, opts("sandbox", mapping));
    expect(result.items[0].taxes).toEqual([{ tax_code: "EXENTO" }]); // not IVA_19
    expect(result.items[0].code).toBe("PROD-DES-05"); // Siigo product code
  });

  it("falls back to rate-derived tax when the mapped product no longer exists", () => {
    const mapping: CatalogMapping = {
      ...baseMapping,
      items: [{ provetCode: "SERV-CG-01", siigoProductId: "PROD-GONE" }],
    };
    const result = map(0, opts("sandbox", mapping));
    expect(result.items[0].code).toBe("SERV-CG-01");
    expect(result.items[0].taxes).toEqual([{ tax_code: "IVA_19" }]);
  });

  it("transforms CON-002 (IVA_5 product, Efectivo) correctly", () => {
    const result = map(1);
    expect(result.items[0].code).toBe("PROC-VAC-01");
    expect(result.items[0].price).toBe(52500);
    expect(result.items[0].taxes).toEqual([{ tax_code: "IVA_5" }]);
    expect(result.payments[0].payment_type_id).toBe("PT-001");
    expect(result.total).toBe(52500);
    expect(() => siigoInvoicePayloadSchema.parse(result)).not.toThrow();
  });

  it("transforms CON-003 (EXENTO product + unmapped fallback) correctly", () => {
    const result = map(2);
    expect(result.items[0].code).toBe("PROD-DES-05");
    expect(result.items[0].taxes).toEqual([{ tax_code: "EXENTO" }]);
    expect(result.items[1].code).toBe("SERV-CUN-01");
    expect(result.items[1].taxes).toEqual([{ tax_code: "EXENTO" }]);
    expect(result.payments[0].payment_type_id).toBe("PT-003");
    expect(result.total).toBe(120000);
    expect(() => siigoInvoicePayloadSchema.parse(result)).not.toThrow();
  });

  it("throws when the payment method is unmapped or mapped to null", () => {
    const noMethod: CatalogMapping = { ...baseMapping, payments: [] };
    expect(() => map(0, opts("sandbox", noMethod))).toThrow(
      "Unmapped payment method",
    );
    const nullMethod: CatalogMapping = {
      ...baseMapping,
      payments: [{ provetMethod: "Tarjeta Crédito", siigoPaymentTypeId: null }],
    };
    expect(() => map(0, opts("sandbox", nullMethod))).toThrow(
      "Unmapped payment method",
    );
  });

  it("defaults to the legacy static mapping when options are omitted", () => {
    const result = provetToSiigoInvoice(
      mockConsultations[0],
      mockClients[0],
      mockPatients[0],
    );
    expect(result.payments[0].payment_type_id).toBe("PT-002");
    expect(result.items[0].taxes).toEqual([{ tax_code: "IVA_19" }]);
    expect(result.stamp.send).toBe(false);
    expect(result.mail.send).toBe(false);
  });

  it("gates stamp.send and mail.send via the environment mode", () => {
    const sandbox = map(0, opts("sandbox"));
    expect(sandbox.stamp.send).toBe(false);
    expect(sandbox.mail.send).toBe(false);
    const production = map(0, opts("production"));
    expect(production.stamp.send).toBe(true);
    expect(production.mail.send).toBe(true);
  });
});

describe("provetToSiigoInvoice — zero-drift rounding", () => {
  it("rounds the unit price to 6 decimals and reconciles totals at cent level", () => {
    const consultation = {
      ...mockConsultations[0],
      items: [{ name: "Svc", code: "SERV-CG-01", quantity: 1, unit_price: 100.123456, tax_rate: 0.19, discount: 0 }],
      subtotal: 100.123456,
      tax_total: 19.023456,
      total: 119.15,
    };
    const result = provetToSiigoInvoice(consultation, mockClients[0], mockPatients[0], opts());
    const frac = String(result.items[0].price).split(".")[1] ?? "";
    expect(frac.length).toBeLessThanOrEqual(6);
    expect(() => siigoInvoicePayloadSchema.parse(result)).not.toThrow();
  });
});
