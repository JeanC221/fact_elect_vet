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
  ProvetInvoiceRowRaw,
} from "@/schemas/provetApi";

const row = (over: Partial<ProvetInvoiceRowRaw> = {}): ProvetInvoiceRowRaw => ({
  url: "https://api.provet.test/invoicerow/1/",
  invoice: "https://api.provet.test/invoice/INV-1/",
  item: "https://api.provet.test/item/74/",
  name: "Alfaxan Inj",
  quantity: 0.05,
  price: 249.93,
  price_with_vat: 263.0013,
  vat_percentage: 5.23,
  sum: 30.001,
  sum_vat: 1.569,
  sum_total: 31.57,
  ...over,
});

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

describe("line amounts come from invoicerow.sum_total, never from quantity * price", () => {
  it("bills the amount Provet computed, not quantity * price_with_vat", () => {
    // Real data, consultation 38: 0.05 * 263.0013 = 13.15, but Provet charges
    // 31.57 — `quantity` is the fraction of a vial dispensed, not a count.
    const r = buildQueueFromProvet(
      [con({ id: "C-38" })], [cli()], [pat()],
      [inv({ id: "INV-1", consultation: "C-38", total_with_vat: 60.07 })],
      [], [],
      [row({ sum_total: 31.57 }), row({ url: "https://api.provet.test/invoicerow/2/", item: "https://api.provet.test/item/75/", name: "Anal Gland Expression", quantity: 1, sum_total: 28.5 })],
    )[0];

    expect(r.items.map((i) => i.lineTotal)).toEqual([31.57, 28.5]);
    expect(r.items.reduce((s, i) => s + i.lineTotal, 0)).toBeCloseTo(60.07, 2);
    // The invoice total the queue shows must equal what we would bill.
    expect(r.total).toBeCloseTo(60.07, 2);
  });

  it("keeps billing rows that have no consultationitem behind them (dispensing fees)", () => {
    const r = buildQueueFromProvet(
      [con({ id: "C-15" })], [cli()], [pat()],
      [inv({ id: "INV-9", consultation: "C-15", total_with_vat: 27.76 })],
      [], [],
      [
        row({ invoice: "https://api.provet.test/invoice/INV-9/", name: "Amoxicillin", sum_total: 19.11 }),
        row({ url: "https://api.provet.test/invoicerow/3/", invoice: "https://api.provet.test/invoice/INV-9/", item: null, name: "Dispensing fee", quantity: 1, sum_total: 8.65 }),
      ],
    )[0];

    expect(r.items).toHaveLength(2);
    expect(r.items.reduce((s, i) => s + i.lineTotal, 0)).toBeCloseTo(27.76, 2);
  });

  it("uses the stable Provet item id as the catalog-mapping code, not the per-consultation row id", () => {
    const r = buildQueueFromProvet(
      [con({ id: "C-38" })], [cli()], [pat()],
      [inv({ id: "INV-1", consultation: "C-38" })],
      [], [],
      [row()],
    )[0];
    expect(r.items[0].code).toBe("74");
  });

  it("returns no items when the consultation has no Provet invoice, rather than inventing amounts", () => {
    const r = buildQueueFromProvet([con({ id: "C-99" })], [cli()], [pat()], [], [], [], [row()])[0];
    expect(r.items).toEqual([]);
  });

  it("drops zero-amount rows so they cannot reach Siigo as free items", () => {
    const r = buildQueueFromProvet(
      [con({ id: "C-38" })], [cli()], [pat()],
      [inv({ id: "INV-1", consultation: "C-38" })],
      [], [],
      [row({ sum_total: 31.57 }), row({ url: "https://api.provet.test/invoicerow/4/", name: "Nota", sum_total: 0 })],
    )[0];
    expect(r.items).toHaveLength(1);
  });
});

/**
 * C-11 — the assert that was missing entirely: the queue's `total` comes from
 * `invoice.total_with_vat` and its `items` come from `invoicerow.sum_total`,
 * and until now nothing in the codebase ever compared the two.
 *
 * The reproduction is invoice 12 of the live tenant, measured 2026-09-11:
 * `total_with_vat` is 158.28 while the rows this code keeps add up to 187.50,
 * because the `sum_total <= 0` filter on line 117 silently drops a -29.22 row
 * (C-2). The three amounts are the measured ones; how the 187.50 is split
 * across positive rows is synthetic, since only the totals were recorded.
 *
 * Comparing the RAW rows against `total_with_vat` would pass here — Provet's
 * own arithmetic is consistent. The comparison has to be against the rows the
 * code actually kept, which is the whole point of the guard.
 */
describe("C-11 — total_with_vat vs the line totals the code builds", () => {
  const invoice12 = inv({
    id: "I-12",
    url: "https://api.provet.test/invoice/12/",
    consultation: "C-12",
    total: 132.99,
    total_vat: 25.29,
    total_with_vat: 158.28,
  });
  const rowsOf12: ProvetInvoiceRowRaw[] = [
    row({ url: "https://api.provet.test/invoicerow/120/", invoice: "https://api.provet.test/invoice/12/", item: "https://api.provet.test/item/74/", name: "Consulta general", sum_total: 100.0 }),
    row({ url: "https://api.provet.test/invoicerow/121/", invoice: "https://api.provet.test/invoice/12/", item: "https://api.provet.test/item/75/", name: "Amoxicillin 250mg", sum_total: 87.5 }),
    row({ url: "https://api.provet.test/invoicerow/122/", invoice: "https://api.provet.test/invoice/12/", item: "https://api.provet.test/item/76/", name: "Ajuste", sum_total: -29.22 }),
  ];

  it("flags invoice 12: the kept rows add up to 187.50 against a header of 158.28", () => {
    const rows = buildQueueFromProvet(
      [con({ id: "C-12", invoice: "https://api.provet.test/invoice/12/" })],
      [cli()], [pat()], [invoice12], [], [], rowsOf12,
    );
    const r = rows[0];
    expect(r.total).toBe(158.28);
    expect(r.items.reduce((a, i) => a + i.lineTotal, 0)).toBe(187.5);
    expect(r.totalMismatch).not.toBeNull();
    expect(r.totalMismatch?.expectedTotal).toBe(158.28);
    expect(r.totalMismatch?.itemsTotal).toBe(187.5);
    expect(r.totalMismatch?.deltaCents).toBe(2922);
  });

  it("does not flag a consultation whose kept rows add up to the header", () => {
    const rows = buildQueueFromProvet(
      [con({ id: "C-12", invoice: "https://api.provet.test/invoice/12/" })],
      [cli()], [pat()],
      [inv({ id: "I-12", url: "https://api.provet.test/invoice/12/", consultation: "C-12", total_with_vat: 187.5 })],
      [], [], rowsOf12,
    );
    expect(rows[0].totalMismatch).toBeNull();
  });

  it("does not flag a consultation with no invoice at all (0 against 0)", () => {
    const rows = buildQueueFromProvet([con()], [cli()], [pat()], [], [], [], []);
    expect(rows[0].total).toBe(0);
    expect(rows[0].items).toEqual([]);
    expect(rows[0].totalMismatch).toBeNull();
  });

  it("flags an invoice that has a header total but no rows at all", () => {
    const rows = buildQueueFromProvet(
      [con({ id: "C-12", invoice: "https://api.provet.test/invoice/12/" })],
      [cli()], [pat()], [invoice12], [], [], [],
    );
    expect(rows[0].totalMismatch?.itemsTotal).toBe(0);
    expect(rows[0].totalMismatch?.deltaCents).toBe(-15828);
  });

  it("uses whole cent integers, not a float epsilon: 0.1 + 0.2 against 0.3 is NOT a mismatch", () => {
    const rows = buildQueueFromProvet(
      [con({ id: "C-12", invoice: "https://api.provet.test/invoice/12/" })],
      [cli()], [pat()],
      [inv({ id: "I-12", url: "https://api.provet.test/invoice/12/", consultation: "C-12", total_with_vat: 0.3 })],
      [], [],
      [
        row({ url: "https://api.provet.test/invoicerow/130/", invoice: "https://api.provet.test/invoice/12/", item: "https://api.provet.test/item/74/", sum_total: 0.1 }),
        row({ url: "https://api.provet.test/invoicerow/131/", invoice: "https://api.provet.test/invoice/12/", item: "https://api.provet.test/item/75/", sum_total: 0.2 }),
      ],
    );
    expect(rows[0].totalMismatch).toBeNull();
  });
});
