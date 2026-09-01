import { describe, it, expect } from "vitest";
import {
  provetToSiigoInvoice,
  MissingEmissionSettingError,
  type ProvetToSiigoOptions,
} from "./provetToSiigo";
import { UnmappedPaymentMethodError, type CatalogMapping } from "@/mappers/catalogMapping";
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
    { provetMethod: "Tarjeta Crédito", siigoPaymentTypeId: 5636 },
    { provetMethod: "Efectivo", siigoPaymentTypeId: 10948 },
    { provetMethod: "Transferencia", siigoPaymentTypeId: 8466 },
  ],
  version: 1,
  updatedAt: "2026-08-26T00:00:00.000Z",
  documentTypeId: 2372,
  creditNoteDocumentTypeId: 2379,
  sellerId: 62,
};

const opts = (
  mode: EnvironmentMode = "sandbox",
  mapping: CatalogMapping = baseMapping,
): ProvetToSiigoOptions => ({ mapping, siigoProducts: mockSiigoProducts, mode, documentTypeId: 2372, sellerId: 62 });

const map = (i: number, o: ProvetToSiigoOptions = opts()) =>
  provetToSiigoInvoice(mockConsultations[i], mockClients[i], mockPatients[i], o);

describe("provetToSiigoInvoice", () => {
  it("transforms CON-001 via dynamic mapping (Zod round-trip)", () => {
    const result = map(0);
    expect(result.date).toBe(new Date().toISOString().slice(0, 10));
    expect(result.seller).toBe(62);
    expect(result.customer.identification).toBe("1234567890");
    expect(result.customer.id_type).toBe("13");
    expect(result.customer.person_type).toBe("Person");
    expect(result.customer.branch_office).toBe(0);
    expect(result.customer.name).toEqual(["María García", "López"]);
    expect(result.customer).not.toHaveProperty("email");
    expect(result.customer).not.toHaveProperty("phone");
    expect(result.customer).not.toHaveProperty("identification_type");
    expect(result).not.toHaveProperty("total");
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ code: "SERV-CG-01", price: 59500 });
    expect(result.items[0]).not.toHaveProperty("taxes");
    expect(result.items[1].code).toBe("LAB-HEM-01");
    expect(result.document).toEqual({ id: 2372 });
    expect(result.payments).toEqual([{ id: 5636, value: 95200 }]);
    expect(() => siigoInvoicePayloadSchema.parse(result)).not.toThrow();
  });

  it("resolves the Siigo product code from the catalog mapping", () => {
    const mapping: CatalogMapping = {
      ...baseMapping,
      items: [{ provetCode: "SERV-CG-01", siigoProductId: "PROD-003" }],
    };
    const result = map(0, opts("sandbox", mapping));
    expect(result.items[0].code).toBe("PROD-DES-05");
  });

  it("keeps the Provet code when the mapped product no longer exists", () => {
    const mapping: CatalogMapping = {
      ...baseMapping,
      items: [{ provetCode: "SERV-CG-01", siigoProductId: "PROD-GONE" }],
    };
    const result = map(0, opts("sandbox", mapping));
    expect(result.items[0].code).toBe("SERV-CG-01");
  });

  it("transforms CON-002 (IVA_5 product, Efectivo) correctly", () => {
    const result = map(1);
    expect(result.items[0].code).toBe("PROC-VAC-01");
    expect(result.items[0].price).toBe(52500);
    expect(result.payments[0].id).toBe(10948);
    expect(result.payments[0].value).toBe(52500);
    expect(result.customer.name).toEqual(["Veterinaria Los Andes S.A.S."]);
    expect(result.customer).toMatchObject({ identification: "900123456", check_digit: "1", id_type: "31", person_type: "Company", branch_office: 0 });
    expect(() => siigoInvoicePayloadSchema.parse(result)).not.toThrow();
  });

  it("transforms CON-003 (EXENTO product + unmapped fallback) correctly", () => {
    const result = map(2);
    expect(result.items[0].code).toBe("PROD-DES-05");
    expect(result.items[1].code).toBe("SERV-CUN-01");
    expect(result.payments[0].id).toBe(8466);
    expect(result.payments[0].value).toBe(120000);
    expect(result.customer.name).toEqual(["John", "Smith"]);
    expect(result.customer).toMatchObject({ identification: "CE9876543", id_type: "22", person_type: "Person" });
    expect(() => siigoInvoicePayloadSchema.parse(result)).not.toThrow();
  });

  it("throws UnmappedPaymentMethodError when the payment catalog has no matching entry", () => {
    const noMethod: CatalogMapping = { ...baseMapping, payments: [] };
    expect(() => map(0, opts("sandbox", noMethod))).toThrow(UnmappedPaymentMethodError);
    const nullMethod: CatalogMapping = {
      ...baseMapping,
      payments: [
        { provetMethod: "Tarjeta Crédito", siigoPaymentTypeId: null },
        { provetMethod: "Efectivo", siigoPaymentTypeId: 10948 },
      ],
    };
    expect(() => map(0, opts("sandbox", nullMethod))).toThrow(/método de pago sin mapeo/i);
  });

  it("throws MissingEmissionSettingError when options are omitted (documentTypeId/sellerId not configured)", () => {
    expect(() =>
      provetToSiigoInvoice(mockConsultations[0], mockClients[0], mockPatients[0]),
    ).toThrow(MissingEmissionSettingError);
  });

  it("throws MissingEmissionSettingError('sellerId') specifically when only documentTypeId is configured", () => {
    const partial: ProvetToSiigoOptions = { mapping: baseMapping, siigoProducts: mockSiigoProducts, mode: "sandbox", documentTypeId: 2372 };
    expect(() =>
      provetToSiigoInvoice(mockConsultations[0], mockClients[0], mockPatients[0], partial),
    ).toThrow(/vendedor/i);
  });

  it("overrides the document type id and seller via options", () => {
    const result = map(0, { ...opts(), documentTypeId: 3001, sellerId: 99 });
    expect(result.document).toEqual({ id: 3001 });
    expect(result.seller).toBe(99);
    expect(() => siigoInvoicePayloadSchema.parse(result)).not.toThrow();
  });

  it("gates stamp.send via the environment mode and keeps mail.send true", () => {
    const sandbox = map(0, opts("sandbox"));
    expect(sandbox.stamp.send).toBe(false);
    expect(sandbox.mail.send).toBe(true);
    const production = map(0, opts("production"));
    expect(production.stamp.send).toBe(true);
    expect(production.mail.send).toBe(true);
  });
});