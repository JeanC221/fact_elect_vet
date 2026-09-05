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
  items: [],
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

const opts = (over: Partial<ProvetToSiigoOptions> = {}): ProvetToSiigoOptions => ({
  mapping: baseMapping,
  siigoProducts: mockSiigoProducts,
  mode: "sandbox",
  documentTypeId: 2372,
  sellerId: 62,
  ...over,
});

const map = (i: number, o: ProvetToSiigoOptions = opts()) =>
  provetToSiigoInvoice(mockConsultations[i], mockClients[i], mockPatients[i], o);

describe("Siigo POST /v1/invoices payload invariants", () => {
  it("never emits a root `total` key, even when one is injected before parsing", () => {
    const result = map(0);
    expect(result).not.toHaveProperty("total");
    const parsed = siigoInvoicePayloadSchema.parse({ ...result, total: 999 });
    expect(parsed).not.toHaveProperty("total");
    expect(Object.keys(parsed).sort()).toEqual(
      ["customer", "date", "document", "items", "mail", "payments", "seller", "stamp"].sort(),
    );
  });

  it("emits payments with numeric ids and a value equal to the emitted line totals", () => {
    const result = map(0);
    expect(result.payments).toHaveLength(1);
    const payment = result.payments[0];
    expect(Number.isInteger(payment.id)).toBe(true);
    expect(payment.id).toBeGreaterThan(0);
    const lineTotal = result.items.reduce((s, i) => s + i.taxed_price! * i.quantity, 0);
    expect(payment.value).toBe(lineTotal);
  });

  it("eliminates float drift so sum(payments) === sum(items) exactly (zero divergence)", () => {
    const driftConsultation = {
      ...mockConsultations[0],
      items: [{ name: "Svc", code: "SERV-CG-01", quantity: 3, unit_price: 6540.99, tax_rate: 0.19, discount: 0 }],
      subtotal: 19622.97,
      tax_total: 3728.36,
      total: 23351.33,
    };
    const result = provetToSiigoInvoice(driftConsultation, mockClients[0], mockPatients[0], opts());
    const itemSum = result.items.reduce((s, i) => s + i.taxed_price! * i.quantity, 0);
    expect(result.payments[0].value).toBe(itemSum);
    expect(String(result.items[0].taxed_price)).not.toMatch(/0{3,}/);
    expect(() => siigoInvoicePayloadSchema.parse(result)).not.toThrow();
  });

  it("emits customer.identification as a flat alphanumeric string and branch_office as integer 0", () => {
    for (const i of [0, 1, 2]) {
      const { customer } = map(i);
      expect(typeof customer.identification).toBe("string");
      expect(customer.identification).toMatch(/^[A-Za-z0-9]+$/);
      expect(customer.branch_office).toBe(0);
      expect(Number.isInteger(customer.branch_office)).toBe(true);
    }
  });

  it("splits the NIT check digit out of identification (F2)", () => {
    const { customer } = map(1);
    expect(customer.identification).toBe("900123456");
    expect(customer.check_digit).toBe("1");
  });

  it("emits a single business-name element for Company customers (F4)", () => {
    const { customer } = map(1);
    expect(customer.person_type).toBe("Company");
    expect(customer.name).toHaveLength(1);
    expect(customer.name[0]).toBe("Veterinaria Los Andes S.A.S.");
  });

  it("emits contacts with email whenever mail.send is true (F3)", () => {
    const result = map(0);
    expect(result.mail.send).toBe(true);
    expect(result.customer.contacts?.[0]?.email).toBe("maria.garcia@email.com");
  });

  it("resolves seller and document type from options, not hardcoded defaults (F5)", () => {
    const result = map(0, opts({ sellerId: 99, documentTypeId: 3001 }));
    expect(result.seller).toBe(99);
    expect(result.document).toEqual({ id: 3001 });
  });

  it("stays schema-valid across all mock consultations", () => {
    for (const i of [0, 1, 2]) {
      expect(() => siigoInvoicePayloadSchema.parse(map(i))).not.toThrow();
    }
  });
});