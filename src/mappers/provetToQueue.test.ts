import { describe, it, expect } from "vitest";
import {
  extractId,
  buildQueueFromProvet,
  mergeQueueRows,
} from "./provetToQueue";
import type {
  ProvetConsultationRaw,
  ProvetClientRaw,
  ProvetPatientRaw,
  ProvetInvoiceRaw,
} from "@/schemas/provetApi";

const con = (over: Partial<ProvetConsultationRaw> = {}): ProvetConsultationRaw => ({
  id: "C-1",
  client: "CL-1",
  patients: ["P-1"],
  consultation_items: [],
  invoice: null,
  status: "finished",
  started: null,
  finished: "2026-08-20T10:00:00Z",
  ended: null,
  created: "2026-08-20T09:00:00Z",
  modified: "2026-08-20T11:00:00Z",
  ...over,
});
const cli = (over: Partial<ProvetClientRaw> = {}): ProvetClientRaw => ({
  id: "CL-1", url: "https://api.provet.test/client/CL-1/", firstname: "María", lastname: "García",
  organization_name: "", customer_type: "natural", id_number: "1234567890", vat_number: null,
  email: "m@test.co", street_address: "Calle 1", city: "Bogotá", country: null, ...over,
});
const pat = (over: Partial<ProvetPatientRaw> = {}): ProvetPatientRaw => ({
  id: "P-1", url: null, client: "CL-1", name: "Rex", species: "Canino", breed: "Labrador", ...over,
});
const inv = (over: Partial<ProvetInvoiceRaw> = {}): ProvetInvoiceRaw => ({
  id: "I-1", url: null, status: "paid", total: 80000, total_vat: 12797, total_with_vat: 92797,
  consultation: "C-1", client: "CL-1", invoice_number: "INV-1", ...over,
});

describe("extractId", () => {
  it("returns bare ids unchanged", () => {
    expect(extractId("123")).toBe("123");
  });
  it("extracts the trailing segment from a hyperlinked URL", () => {
    expect(extractId("https://api.provet.test/client/CL-1/")).toBe("CL-1");
  });
  it("returns null for null/undefined", () => {
    expect(extractId(null)).toBeNull();
    expect(extractId(undefined)).toBeNull();
  });
});

describe("buildQueueFromProvet", () => {
  it("resolves client name/doc, patient name, total and closed status", () => {
    const rows = buildQueueFromProvet([con()], [cli()], [pat()], [inv()]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.clientName).toBe("María García");
    expect(r.clientDoc).toBe("1234567890");
    expect(r.patientName).toBe("Rex");
    expect(r.total).toBe(92797);
    expect(r.provetStatus).toBe("closed");
    expect(r.invoiceStatus).toBe("Draft");
  });

  it("matches a hyperlinked client relation to its client record", () => {
    const c = con({ client: "https://api.provet.test/client/CL-2/" });
    const cl = cli({ id: "CL-2", firstname: "Juan", lastname: "Pérez", id_number: "9876543210" });
    const row = buildQueueFromProvet([c], [cl], [], [])[0];
    expect(row.clientName).toBe("Juan Pérez");
    expect(row.clientDoc).toBe("9876543210");
  });

  it("falls back to unknown when client/patient/invoice are missing", () => {
    const row = buildQueueFromProvet([con({ finished: null })], [], [], [])[0];
    expect(row.clientName).toBe("Cliente desconocido");
    expect(row.patientName).toBe("Paciente desconocido");
    expect(row.total).toBe(0);
    expect(row.provetStatus).toBe("pending");
  });

  it("uses organization_name for juridical clients", () => {
    const row = buildQueueFromProvet([con({ client: "CL-1" })], [cli({ organization_name: "Vet S.A.S." })], [], [])[0];
    expect(row.clientName).toBe("Vet S.A.S.");
  });
});

describe("mergeQueueRows", () => {
  it("preserves emitted DIAN status for rows still present", () => {
    const prev = buildQueueFromProvet([con()], [cli()], [pat()], [inv()]).map((r) => ({ ...r, invoiceStatus: "Accepted" as const }));
    const fresh = buildQueueFromProvet([con()], [cli()], [pat()], [inv()]);
    const merged = mergeQueueRows(prev, fresh);
    expect(merged[0].invoiceStatus).toBe("Accepted");
  });

  it("keeps Draft for brand-new rows", () => {
    const fresh = buildQueueFromProvet([con({ id: "C-NEW" })], [cli()], [pat()], [inv()]);
    const merged = mergeQueueRows([], fresh);
    expect(merged[0].invoiceStatus).toBe("Draft");
  });
});
