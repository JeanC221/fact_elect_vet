import { describe, expect, it } from "vitest";
import {
  buildConsultationQueue,
  buildInvoicePayloadFromQuickEdit,
  buildPaymentOptions,
  buildQuickEditDetail,
  formatCOP,
  formatDate,
  quickEditFormSchema,
  type QuickEditFormValues,
} from "./consultationQueue";
import { siigoInvoicePayloadSchema } from "@/schemas/siigo";
import { toCents } from "@/schemas/provet";
import { mockClients, mockConsultations, mockPatients } from "@/mocks/provet";
import type { ProvetToSiigoOptions } from "@/mappers/provetToSiigo";
import type { CatalogMapping } from "@/mappers/catalogMapping";
import { mockSiigoProducts } from "@/mocks/siigo";

const validFormValues: QuickEditFormValues = { name: "María García López", identificationType: "CC", identificationNumber: "1234567890", email: "nueva@mail.co", phone: "3105550101", paymentMethod: "Efectivo", paidAmount: 95200 };

/** Dynamic catalog for emission — Task 4: payment ids resolve ONLY from options.mapping.payments. */
const emitOpts: ProvetToSiigoOptions = { mapping: { items: [], payments: [{ provetMethod: "Tarjeta Crédito", siigoPaymentTypeId: 5636 }, { provetMethod: "Efectivo", siigoPaymentTypeId: 10948 }], version: 1, updatedAt: "2026-08-26T00:00:00.000Z", documentTypeId: 2372, creditNoteDocumentTypeId: 2379, sellerId: 62 }, siigoProducts: mockSiigoProducts, mode: "sandbox", documentTypeId: 2372, sellerId: 62 };
/** Mapped catalog for Quick-Edit detail — only active mapped payments appear in the dropdown. */
const testMapping: CatalogMapping = emitOpts.mapping;

describe("buildConsultationQueue", () => {
  it("returns one row per consultation", () => {
    const rows = buildConsultationQueue(mockConsultations, mockClients, mockPatients);
    expect(rows).toHaveLength(mockConsultations.length);
  });

  it("enriches each row with client name and document", () => {
    const con1 = buildConsultationQueue(mockConsultations, mockClients, mockPatients).find((r) => r.id === "CON-001");
    expect(con1?.clientName).toBe("María García López");
    expect(con1?.clientDoc).toBe("CC 1234567890");
  });

  it("enriches each row with patient name", () => {
    expect(buildConsultationQueue(mockConsultations, mockClients, mockPatients).find((r) => r.id === "CON-002")?.patientName).toBe("Rocky");
  });

  it("carries consultation total and payment method", () => {
    const con3 = buildConsultationQueue(mockConsultations, mockClients, mockPatients).find((r) => r.id === "CON-003");
    expect(con3?.total).toBe(120000);
    expect(con3?.paymentMethod).toBe("Transferencia");
  });

  it("defaults invoiceStatus to Draft and preserves provetStatus", () => {
    const rows = buildConsultationQueue(mockConsultations, mockClients, mockPatients);
    rows.forEach((r) => {
      expect(r.invoiceStatus).toBe("Draft");
      expect(["pending", "closed"]).toContain(r.provetStatus);
    });
  });

  it("falls back gracefully for unknown client/patient", () => {
    const orphan = [{ ...mockConsultations[0], id: "CON-X", client_id: "CLI-NOPE", patient_id: "PAT-NOPE" }];
    const rows = buildConsultationQueue(orphan, mockClients, mockPatients);
    expect(rows[0].clientName).toBe("Cliente desconocido");
    expect(rows[0].patientName).toBe("Paciente desconocido");
    expect(rows[0].clientDoc).toBe("—");
  });
});

describe("formatCOP", () => {
  it("formats a number as Colombian pesos without decimals", () => {
    expect(formatCOP(95200)).toBe("$95.200");
  });
});

describe("formatDate", () => {
  it("formats an ISO date as YYYY-MM-DD (es-CO)", () => {
    expect(formatDate(new Date("2026-08-15T08:00:00.000Z"))).toMatch(/2026-08-15/);
  });
});

describe("buildQuickEditDetail", () => {
  it("builds pre-filled detail for a known consultation with mapped payment options and empty paymentMethod", () => {
    const d = buildQuickEditDetail(mockConsultations, mockClients, mockPatients, "CON-001", testMapping);
    expect(d?.clientName).toBe("María García López");
    expect(d?.identificationNumber).toBe("1234567890");
    expect(d?.phone).toBe("3105550101");
    expect([d?.patientName, d?.total]).toEqual(["Max", 95200]);
    expect(d?.paymentMethod).toBe("");
    expect(d?.paymentMethodOptions).toEqual([
      { provetMethod: "Tarjeta Crédito", siigoPaymentTypeId: 5636 },
      { provetMethod: "Efectivo", siigoPaymentTypeId: 10948 },
    ]);
  });

  it("returns undefined for unknown consultation id", () => {
    expect(buildQuickEditDetail(mockConsultations, mockClients, mockPatients, "CON-NOPE")).toBeUndefined();
  });

  it("returns a detail with fallback defaults for an orphan client instead of undefined", () => {
    const orphan = [{ ...mockConsultations[0], id: "CON-X", client_id: "CLI-NOPE" }];
    const d = buildQuickEditDetail(orphan, mockClients, mockPatients, "CON-X");
    expect(d).toBeDefined();
    expect([d?.clientName, d?.identificationType, d?.identificationNumber, d?.email]).toEqual(["Cliente desconocido", "CC", "", ""]);
  });

  it("only includes active mapped payments — unmapped methods like Nequi are excluded", () => {
    const custom = [{ ...mockConsultations[0], payment_method: "Nequi" }];
    const d = buildQuickEditDetail(custom, mockClients, mockPatients, "CON-001", testMapping);
    expect(d?.paymentMethodOptions.map((o) => o.provetMethod)).not.toContain("Nequi");
    expect(d?.paymentMethodOptions.map((o) => o.provetMethod)).toEqual(["Tarjeta Crédito", "Efectivo"]);
  });
});

describe("buildPaymentOptions", () => {
  it("returns only non-null mapped payments", () => {
    const mapping: CatalogMapping = { items: [], payments: [{ provetMethod: "Efectivo", siigoPaymentTypeId: 10948 }, { provetMethod: "Nequi", siigoPaymentTypeId: null }], version: 1, updatedAt: "2026-08-26T00:00:00.000Z", documentTypeId: null, creditNoteDocumentTypeId: null, sellerId: null };
    expect(buildPaymentOptions(mapping)).toEqual([{ provetMethod: "Efectivo", siigoPaymentTypeId: 10948 }]);
  });
  it("returns empty array when no mapping provided", () => {
    expect(buildPaymentOptions(undefined)).toEqual([]);
  });
});

describe("quickEditFormSchema", () => {
  it("accepts valid values", () => {
    expect(quickEditFormSchema.safeParse(validFormValues).success).toBe(true);
  });

  it("rejects invalid email, wrong NIT format and non-positive paidAmount", () => {
    expect(quickEditFormSchema.safeParse({ ...validFormValues, email: "nope" }).success).toBe(false);
    expect(quickEditFormSchema.safeParse({ ...validFormValues, identificationType: "NIT", identificationNumber: "ABC" }).success).toBe(false);
    expect(quickEditFormSchema.safeParse({ ...validFormValues, paidAmount: 0 }).success).toBe(false);
  });

  it("accepts a NIT with or without the verification-digit hyphen", () => {
    expect(quickEditFormSchema.safeParse({ ...validFormValues, identificationType: "NIT", identificationNumber: "900123456-1" }).success).toBe(true);
    expect(quickEditFormSchema.safeParse({ ...validFormValues, identificationType: "NIT", identificationNumber: "9001234561" }).success).toBe(true);
  });

  it("rejects a paidAmount with more than 2 decimals", () => {
    expect(quickEditFormSchema.safeParse({ ...validFormValues, paidAmount: 95200.001 }).success).toBe(false);
  });

  it("rejects empty name and too-short phone", () => {
    expect(quickEditFormSchema.safeParse({ ...validFormValues, name: "" }).success).toBe(false);
    expect(quickEditFormSchema.safeParse({ ...validFormValues, phone: "123456" }).success).toBe(false);
  });

  it("rejects a negative paidAmount", () => {
    expect(quickEditFormSchema.safeParse({ ...validFormValues, paidAmount: -100 }).success).toBe(false);
  });

  it("accepts a paidAmount with exactly 2 decimal places", () => {
    expect(quickEditFormSchema.safeParse({ ...validFormValues, paidAmount: 95200.10 }).success).toBe(true);
  });

  it("balances a fractional paidAmount against an equal fractional total via cent-integer comparison", () => {
    const fractional = [{ ...mockConsultations[0], total: 80.10 }];
    const d = buildQuickEditDetail(fractional, mockClients, mockPatients, "CON-001");
    expect(d?.total).toBe(80.10);
    expect(toCents(d?.total ?? 0) - toCents(80.10) === 0).toBe(true);
  });
});

describe("buildInvoicePayloadFromQuickEdit", () => {
  it("applies form overrides, dynamic payment mapping and keeps stamp.send=false", () => {
    const p = buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, "CON-001", validFormValues, emitOpts);
    expect(p?.customer.branch_office).toBe(0);
    expect(p?.customer.name).toEqual(["María García", "López"]);
    expect(p?.customer.person_type).toBe("Person");
    expect(p?.payments[0].id).toBe(10948);
    expect(p?.stamp.send).toBe(false);
    expect(p?.mail.send).toBe(true);
  });

  it("produces a payload passing siigoInvoicePayloadSchema", () => {
    const p = buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, "CON-001", validFormValues, emitOpts);
    expect(siigoInvoicePayloadSchema.safeParse(p).success).toBe(true);
  });

  it("returns undefined for unknown id or orphan client", () => {
    expect(buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, "CON-NOPE", validFormValues)).toBeUndefined();
    const orphan = [{ ...mockConsultations[0], id: "CON-X", client_id: "CLI-NOPE" }];
    expect(buildInvoicePayloadFromQuickEdit(orphan, mockClients, mockPatients, "CON-X", validFormValues)).toBeUndefined();
  });

  it("keeps sum(payments.value) == sum(items.price*quantity) to prevent invalid_total_payments", () => {
    const p = buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, "CON-001", validFormValues, emitOpts);
    expect(p).toBeDefined();
    const itemsTotal = p!.items.reduce((s, it) => s + it.price * it.quantity, 0);
    const paymentsTotal = p!.payments.reduce((s, pay) => s + pay.value, 0);
    expect(toCents(paymentsTotal)).toBe(toCents(itemsTotal));
  });
});