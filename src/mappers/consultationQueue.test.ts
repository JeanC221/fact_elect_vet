import { describe, expect, it } from "vitest";
import {
  buildConsultationQueue,
  buildInvoicePayloadFromQuickEdit,
  buildQuickEditDetail,
  formatCOP,
  formatDate,
  quickEditFormSchema,
  type QuickEditFormValues,
} from "./consultationQueue";
import { siigoInvoicePayloadSchema } from "@/schemas/siigo";
import { mockClients, mockConsultations, mockPatients } from "@/mocks/provet";

const validFormValues: QuickEditFormValues = {
  identificationType: "CC",
  identificationNumber: "1234567890",
  email: "nueva@mail.co",
  address: "Cra 7 #10-20",
  paymentMethod: "Efectivo",
  paidAmount: 95200,
};

describe("buildConsultationQueue", () => {
  it("returns one row per consultation", () => {
    const rows = buildConsultationQueue(mockConsultations, mockClients, mockPatients);
    expect(rows).toHaveLength(mockConsultations.length);
  });

  it("enriches each row with client name and document", () => {
    const rows = buildConsultationQueue(mockConsultations, mockClients, mockPatients);
    const con1 = rows.find((r) => r.id === "CON-001");
    expect(con1?.clientName).toBe("María García López");
    expect(con1?.clientDoc).toBe("CC 1234567890");
  });

  it("enriches each row with patient name", () => {
    const rows = buildConsultationQueue(mockConsultations, mockClients, mockPatients);
    const con2 = rows.find((r) => r.id === "CON-002");
    expect(con2?.patientName).toBe("Rocky");
  });

  it("carries consultation total and payment method", () => {
    const rows = buildConsultationQueue(mockConsultations, mockClients, mockPatients);
    const con3 = rows.find((r) => r.id === "CON-003");
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
  it("builds pre-filled detail for a known consultation", () => {
    const d = buildQuickEditDetail(mockConsultations, mockClients, mockPatients, "CON-001");
    expect(d?.clientName).toBe("María García López");
    expect(d?.identificationNumber).toBe("1234567890");
    expect(d?.patientName).toBe("Max");
    expect(d?.total).toBe(95200);
    expect(d?.paymentMethodOptions).toContain("Tarjeta Crédito");
  });

  it("returns undefined for unknown id or orphan client", () => {
    expect(buildQuickEditDetail(mockConsultations, mockClients, mockPatients, "CON-NOPE")).toBeUndefined();
    const orphan = [{ ...mockConsultations[0], id: "CON-X", client_id: "CLI-NOPE" }];
    expect(buildQuickEditDetail(orphan, mockClients, mockPatients, "CON-X")).toBeUndefined();
  });

  it("prepends unmapped payment method to options", () => {
    const custom = [{ ...mockConsultations[0], payment_method: "Nequi" }];
    const d = buildQuickEditDetail(custom, mockClients, mockPatients, "CON-001");
    expect(d?.paymentMethodOptions[0]).toBe("Nequi");
  });
});

describe("quickEditFormSchema", () => {
  it("accepts valid values", () => {
    expect(quickEditFormSchema.safeParse(validFormValues).success).toBe(true);
  });

  it("rejects invalid email, wrong NIT format and non-positive paidAmount", () => {
    expect(quickEditFormSchema.safeParse({ ...validFormValues, email: "nope" }).success).toBe(false);
    expect(quickEditFormSchema.safeParse({ ...validFormValues, identificationType: "NIT" }).success).toBe(false);
    expect(quickEditFormSchema.safeParse({ ...validFormValues, paidAmount: 0 }).success).toBe(false);
  });

  it("accepts a NIT with the verification-digit hyphen (900123456-1)", () => {
    expect(
      quickEditFormSchema.safeParse({ ...validFormValues, identificationType: "NIT", identificationNumber: "900123456-1" }).success,
    ).toBe(true);
  });

  it("rejects a NIT missing the hyphen verification digit (9001234561)", () => {
    expect(
      quickEditFormSchema.safeParse({ ...validFormValues, identificationType: "NIT", identificationNumber: "9001234561" }).success,
    ).toBe(false);
  });

  it("rejects a paidAmount with more than 2 decimals", () => {
    expect(quickEditFormSchema.safeParse({ ...validFormValues, paidAmount: 95200.001 }).success).toBe(false);
  });
});

describe("buildInvoicePayloadFromQuickEdit", () => {
  it("applies form overrides and keeps stamp.send=false", () => {
    const p = buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, "CON-001", validFormValues);
    expect(p?.customer.email).toBe("nueva@mail.co");
    expect(p?.customer.address).toBe("Cra 7 #10-20");
    expect(p?.payments[0].payment_type_id).toBe("PT-001");
    expect(p?.stamp.send).toBe(false);
    expect(p?.mail.send).toBe(false);
  });

  it("produces a payload passing siigoInvoicePayloadSchema", () => {
    const p = buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, "CON-001", validFormValues);
    expect(siigoInvoicePayloadSchema.safeParse(p).success).toBe(true);
  });

  it("returns undefined for unknown id or orphan client", () => {
    expect(buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, "CON-NOPE", validFormValues)).toBeUndefined();
    const orphan = [{ ...mockConsultations[0], id: "CON-X", client_id: "CLI-NOPE" }];
    expect(buildInvoicePayloadFromQuickEdit(orphan, mockClients, mockPatients, "CON-X", validFormValues)).toBeUndefined();
  });
});