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
  consultation: "C-1", credit_note: false, original_consultation: null,
  client: "CL-1", invoice_number: "INV-1", ...over,
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
 * RE-BASED 2026-09-11 by C-2. The original reproduction was `factura #12`, and
 * its whole premise was the bug: the `sum_total <= 0` filter dropped a -29.22
 * row, so the kept rows added to 187.50 against a header of 158.28. C-2 keeps
 * that row, the two sides reconcile, and the scenario stops existing. The old
 * fixture also mixed amounts from different documents while presenting them as
 * one measured invoice, which is the conflation that produced the withdrawn
 * 1574.04; it is gone.
 *
 * The replacement is `consulta #8`, measured verbatim on 2026-09-11 and still
 * mismatching after C-1 and C-2 — nothing in it is synthetic:
 *
 *   factura #11   consultation=#8   total_with_vat=2380.85
 *                 rows #28..#33: 2000.00 / 62.50 / 125.00 / 50.00 / 100.00 / 43.35
 *   NC #12        credit_note=true  consultation=null  original_consultation=#8
 *                 total_with_vat=158.28
 *                 rows #34..#36: -29.22 / 62.50 / 125.00
 *
 * C-1 routes the note's three rows to `consulta #8` and C-2 keeps the negative
 * one, so items add to 2539.13 while the queue row's total is still the
 * original invoice's header, 2380.85. The guard fires, the consultation is
 * blocked, and it stays blocked until the header is netted — which is the
 * finding that unblocks all six, not something C-2 was ever going to fix.
 *
 * Comparing the RAW rows of `factura #11` against its own `total_with_vat`
 * would pass: Provet's arithmetic is self-consistent. The comparison has to be
 * against the items the code actually builds, which is the whole point.
 */
describe("C-11 — total_with_vat vs the line totals the code builds", () => {
  const invoice11 = inv({
    id: "I-11",
    url: "https://api.provet.test/invoice/11/",
    consultation: "https://api.provet.test/consultation/8/",
    credit_note: false,
    original_consultation: null,
    total: 2380.85,
    total_vat: 0,
    total_with_vat: 2380.85,
  });
  const creditNote12 = inv({
    id: "I-12",
    url: "https://api.provet.test/invoice/12/",
    consultation: null,
    credit_note: true,
    original_consultation: "https://api.provet.test/consultation/8/",
    total: 158.28,
    total_vat: 0,
    total_with_vat: 158.28,
  });
  const mk = (id: string, invoiceId: string, item: string, name: string, sum: number) =>
    row({ url: `https://api.provet.test/invoicerow/${id}/`, invoice: `https://api.provet.test/invoice/${invoiceId}/`, item: `https://api.provet.test/item/${item}/`, name, quantity: 1, sum_total: sum });
  const rowsOf11: ProvetInvoiceRowRaw[] = [
    mk("28", "11", "155", "Splenectomy", 2000.0),
    mk("29", "11", "157", "Suction SX", 62.5),
    mk("30", "11", "156", "Cautery", 125.0),
    mk("31", "11", "3", "Anesthesia Sevo", 50.0),
    mk("32", "11", "6", "Anesthesia Vitals Monitoring", 100.0),
    mk("33", "11", "165", "Nocita", 43.35),
  ];
  const rowsOf12: ProvetInvoiceRowRaw[] = [
    mk("34", "12", "155", "Splenectomy", -29.22),
    mk("35", "12", "157", "Suction SX", 62.5),
    mk("36", "12", "156", "Cautery", 125.0),
  ];
  const consultation8 = con({ id: "8", invoice: "https://api.provet.test/invoice/11/" });

  it("flags consulta #8: items add up to 2539.13 against a header of 2380.85", () => {
    const r = buildQueueFromProvet(
      [consultation8], [cli()], [pat()], [invoice11, creditNote12], [], [], [...rowsOf11, ...rowsOf12],
    )[0];
    expect(r.total).toBe(2380.85);
    expect(r.items.reduce((a, i) => a + i.lineTotal, 0)).toBeCloseTo(2539.13, 2);
    expect(r.totalMismatch).not.toBeNull();
    expect(r.totalMismatch?.expectedTotal).toBe(2380.85);
    expect(r.totalMismatch?.itemsTotal).toBe(2539.13);
    expect(r.totalMismatch?.deltaCents).toBe(15828);
  });

  it("does not flag a consultation whose items add up to the header", () => {
    const r = buildQueueFromProvet(
      [consultation8], [cli()], [pat()], [invoice11], [], [], rowsOf11,
    )[0];
    expect(r.items.reduce((a, i) => a + i.lineTotal, 0)).toBeCloseTo(2380.85, 2);
    expect(r.totalMismatch).toBeNull();
  });

  it("does not flag a consultation with no invoice at all (0 against 0)", () => {
    const rows = buildQueueFromProvet([con()], [cli()], [pat()], [], [], [], []);
    expect(rows[0].total).toBe(0);
    expect(rows[0].items).toEqual([]);
    expect(rows[0].totalMismatch).toBeNull();
  });

  it("flags an invoice that has a header total but no rows at all", () => {
    const rows = buildQueueFromProvet([consultation8], [cli()], [pat()], [invoice11], [], [], []);
    expect(rows[0].totalMismatch?.itemsTotal).toBe(0);
    expect(rows[0].totalMismatch?.deltaCents).toBe(-238085);
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


/**
 * C-1 — a Provet credit note never reaches the consultation it reverses, so
 * the consultation is queued as if the refund had never happened.
 *
 * `consultationByInvoiceId` is built from `invoice.consultation`, and every
 * Provet credit note carries `consultation: null`. The credit note resolves to
 * nothing, all of its rows hit the `if (!cid) continue`, and the document
 * vanishes. The link to the consultation lives in `invoice.original_consultation`.
 *
 * SCOPE: C-1 is the join and nothing else. The credit row arrives with its
 * LITERAL `sum_total` and no sign handling, because the sign convention of
 * Provet credit notes is not determined (see below). The queue row's own
 * `total` is left alone. The consequence is intentional and is the point of
 * the fix: items and total stop agreeing, the C-11 guard fires, and the
 * consultation is BLOCKED instead of being silently billed gross. Netting the
 * total is a separate finding.
 *
 * Measured against the sandbox tenant on 2026-09-11, verbatim from the API:
 *
 *   invoice 5   credit_note=false  consultation=/consultation/4/  original_consultation=null
 *               total_with_vat=1699.04
 *               rows 1..4: sum_total 11.54 / 1500.00 / 62.50 / 125.00
 *   invoice 6   credit_note=true   consultation=null              original_consultation=/consultation/4/
 *               total_with_vat=125.00
 *               row 6: sum_total=125.00 quantity=2 credited_invoicerow=/invoicerow/3/
 *
 * Every number in this fixture is literal. Nothing is recalculated from
 * `quantity * price_with_vat`: that product disagrees with `sum_total` on 6 of
 * the tenant's rows because Provet embeds dispensing charges directly in `sum`
 * (invoicerow/48 carries 4.4502 of fee inside a `sum` of 21.4502) and applies
 * line discounts through `percentage_change`/`discount_amount`
 * (invoicerow/111: -20%, original_sum_total 43.35, sum_total 34.68).
 *
 * NOT asserted here, deliberately — the sign convention is undetermined. The
 * credit rows of notes 13, 17, 19 and 31 are the credited row with `quantity`
 * negated; note 6 has `quantity: +2` against the `quantity: 1` of the row it
 * credits, and notes 12, 14 and 16 carry no `credited_invoicerow` at all. No
 * net amount for consultation 4 is claimed by this test.
 */
describe("C-1 — Provet credit notes must reach the consultation they reverse", () => {
  const invoice5 = inv({
    id: "I-5",
    url: "https://api.provet.test/invoice/5/",
    consultation: "https://api.provet.test/consultation/4/",
    credit_note: false,
    original_consultation: null,
    total: 1697.77,
    total_vat: 1.27,
    total_with_vat: 1699.04,
  });
  const creditNote6 = inv({
    id: "I-6",
    url: "https://api.provet.test/invoice/6/",
    consultation: null,
    credit_note: true,
    original_consultation: "https://api.provet.test/consultation/4/",
    total: 125.0,
    total_vat: 0,
    total_with_vat: 125.0,
  });
  const rowsOf5: ProvetInvoiceRowRaw[] = [
    row({ url: "https://api.provet.test/invoicerow/1/", invoice: "https://api.provet.test/invoice/5/", item: "https://api.provet.test/item/75/", name: "Amoxicillin 250mg", quantity: 0.028, price_with_vat: 55, sum_total: 11.54 }),
    row({ url: "https://api.provet.test/invoicerow/2/", invoice: "https://api.provet.test/invoice/5/", item: "https://api.provet.test/item/155/", name: "Splenectomy", quantity: 1, price_with_vat: 1500, sum_total: 1500.0 }),
    row({ url: "https://api.provet.test/invoicerow/3/", invoice: "https://api.provet.test/invoice/5/", item: "https://api.provet.test/item/157/", name: "Suction SX", quantity: 1, price_with_vat: 62.5, sum_total: 62.5 }),
    row({ url: "https://api.provet.test/invoicerow/4/", invoice: "https://api.provet.test/invoice/5/", item: "https://api.provet.test/item/156/", name: "Cautery", quantity: 1, price_with_vat: 125, sum_total: 125.0 }),
  ];
  const creditRow6 = row({
    url: "https://api.provet.test/invoicerow/6/",
    invoice: "https://api.provet.test/invoice/6/",
    item: "https://api.provet.test/item/157/",
    name: "Suction SX",
    quantity: 2,
    price_with_vat: 62.5,
    sum_total: 125.0,
  });
  const consultation4 = con({ id: "4", invoice: "https://api.provet.test/invoice/5/" });

  const build = (rows: ProvetInvoiceRowRaw[], invoices: ProvetInvoiceRaw[]) =>
    buildQueueFromProvet([consultation4], [cli()], [pat()], invoices, [], [], rows)[0];

  it("routes the credit note's rows to the consultation it reverses", () => {
    const r = build([...rowsOf5, creditRow6], [invoice5, creditNote6]);
    expect(r.items).toHaveLength(5);
    expect(r.items.map((i) => i.lineTotal)).toEqual([11.54, 1500.0, 62.5, 125.0, 125.0]);
  });

  it("reads the credit row's sum_total verbatim, with no sign handling", () => {
    const r = build([...rowsOf5, creditRow6], [invoice5, creditNote6]);
    expect(r.items[4]).toEqual({ code: "157", name: "Suction SX", quantity: 2, lineTotal: 125.0 });
  });

  it("blocks the consultation instead of billing it gross: the C-11 guard fires", () => {
    const r = build([...rowsOf5, creditRow6], [invoice5, creditNote6]);
    // The queue row's own total still comes from the ORIGINAL invoice's header.
    // Netting it is a separate finding; leaving it is what makes the guard fire.
    expect(r.total).toBe(1699.04);
    expect(r.totalMismatch).not.toBeNull();
    expect(r.totalMismatch?.deltaCents).toBe(12500);
  });

  it("does not let the credit note's header become the consultation's total", () => {
    const r = build([...rowsOf5, creditRow6], [invoice5, creditNote6]);
    expect(r.total).not.toBe(125.0);
  });

  it("leaves a consultation with no credit note exactly as before", () => {
    const r = build(rowsOf5, [invoice5]);
    expect(r.items.map((i) => i.lineTotal)).toEqual([11.54, 1500.0, 62.5, 125.0]);
    expect(r.total).toBe(1699.04);
    expect(r.totalMismatch).toBeNull();
  });

  it("prefers the invoice's own consultation over the one it reverses", () => {
    // No invoice in the tenant carries both fields today, so nothing catches a
    // flipped precedence at runtime — but flipping it would silently reroute a
    // consultation's own rows to a different consultation. `consultation` is
    // the document's own visit and always wins; `original_consultation` only
    // answers "which visit does this reverse".
    const both = inv({
      id: "I-5", url: "https://api.provet.test/invoice/5/",
      consultation: "https://api.provet.test/consultation/4/",
      credit_note: false,
      original_consultation: "https://api.provet.test/consultation/99/",
      total: 1697.77, total_vat: 1.27, total_with_vat: 1699.04,
    });
    const r = build(rowsOf5, [both]);
    expect(r.items.map((i) => i.lineTotal)).toEqual([11.54, 1500.0, 62.5, 125.0]);
    expect(r.totalMismatch).toBeNull();
  });

  it("ignores a credit note whose original_consultation is null (notes 13 and 14)", () => {
    // Note 14 credits note 13, which credits invoice 10; none of them has a
    // consultation, so there is nothing to attribute and nothing must leak
    // into consultation 4.
    const orphanNote = inv({
      id: "I-14", url: "https://api.provet.test/invoice/14/",
      consultation: null, credit_note: true, original_consultation: null,
      total: 29.22, total_vat: 0, total_with_vat: 29.22,
    });
    const orphanRow = row({
      url: "https://api.provet.test/invoicerow/42/", invoice: "https://api.provet.test/invoice/14/",
      item: "https://api.provet.test/item/122/", name: "Bandage Supplies", quantity: 1,
      price_with_vat: 29.22, sum_total: 29.22,
    });
    const r = build([...rowsOf5, orphanRow], [invoice5, orphanNote]);
    expect(r.items.map((i) => i.lineTotal)).toEqual([11.54, 1500.0, 62.5, 125.0]);
    expect(r.totalMismatch).toBeNull();
  });
});

/**
 * C-2 — `if (lineTotal <= 0) continue` descarta dinero real en silencio.
 *
 * `provetToQueue.ts` tira toda fila cuyo `sum_total` no sea estrictamente
 * positivo. Con C-1 dentro, las filas de abono de una nota de crédito YA
 * llegan a la consulta que revierten, y este filtro las vuelve a tirar: el
 * resto vuelve a cuadrar con la cabecera, el guard de C-11 no ve nada y la
 * consulta se emite bruta.
 *
 * Medido sobre el tenant el 2026-09-11, con C-1 ya mergeado (a7475e3).
 * Cuatro consultas se emiten hoy con el importe equivocado:
 *
 *   consulta  cabecera   abono descartado   se emite   debería
 *        1     2870.00   -62.50 y -125.00    2870.00   2682.50
 *        9      115.00            -15.00      115.00    100.00
 *       10       24.11            -24.11       24.11      0.00
 *       20     3344.38           -831.14     3344.38   2513.24
 *
 * DOS CLASES DISTINTAS BAJO EL MISMO `<= 0`. Además de esas cuatro, otras diez
 * consultas (18, 23, 24, 28, 30, 32, 33, 34, 35, 36) pierden una fila de
 * `sum_total` EXACTAMENTE 0 — siempre el mismo ítem, "PureVax DH2PP Vaccine".
 * Ahí el filtro no borra dinero: quitarlo no mueve ningún total. Lo que sí
 * haría es meter una línea de valor 0 en el payload, y `siigoInvoicePayloadSchema`
 * la rechaza igual que a una negativa (`taxed_price` es `positive()`, medido:
 * 0 -> "Number must be greater than 0"). Representar un obsequio exige
 * `items.tax_base` y `items.taxpayer`, que no existen ni en el esquema ni en
 * `provetToSiigo.ts`.
 *
 * Por eso C-2 deja de descartar las NEGATIVAS y sigue descartando los CEROS.
 * Quitar el filtro entero rompería diez consultas que hoy emiten bien.
 *
 * La negativa tampoco llega nunca a Siigo: en las cuatro, items y cabecera
 * dejan de cuadrar y el guard de C-11 bloquea antes de construir payload.
 *
 * Números medidos: las cabeceras, los abonos y la única fila de la factura 15
 * (Euthanasia 115.00). El reparto de la factura 27 entre su fila de 75.00 y su
 * fila de 0.00 es SINTÉTICO: solo está medida la fila 88 y la cabecera 75.00.
 */
describe("C-2 — el filtro `<= 0` descarta dinero real", () => {
  const consultation9 = con({ id: "9", invoice: "https://api.provet.test/invoice/15/" });
  const invoice15 = inv({
    id: "I-15", url: "https://api.provet.test/invoice/15/",
    consultation: "https://api.provet.test/consultation/9/",
    credit_note: false, original_consultation: null,
    total: 115, total_vat: 0, total_with_vat: 115,
  });
  const creditNote16 = inv({
    id: "I-16", url: "https://api.provet.test/invoice/16/",
    consultation: null, credit_note: true,
    original_consultation: "https://api.provet.test/consultation/9/",
    total: -15, total_vat: 0, total_with_vat: -15,
  });
  const row43 = row({
    url: "https://api.provet.test/invoicerow/43/", invoice: "https://api.provet.test/invoice/15/",
    item: "https://api.provet.test/item/13/", name: "Euthanasia",
    quantity: 1, price_with_vat: 115, sum_total: 115,
  });
  const row44 = row({
    url: "https://api.provet.test/invoicerow/44/", invoice: "https://api.provet.test/invoice/16/",
    item: "https://api.provet.test/item/26/", name: "Extraction Incisor",
    quantity: 1, price_with_vat: -15, sum_total: -15,
  });

  const q9 = () =>
    buildQueueFromProvet([consultation9], [cli()], [pat()], [invoice15, creditNote16], [], [], [row43, row44])[0];

  it("keeps the negative credit row instead of dropping it", () => {
    expect(q9().items.map((i) => i.lineTotal)).toEqual([115, -15]);
  });

  it("blocks consultation 9 instead of billing it at 115.00", () => {
    const r = q9();
    expect(r.total).toBe(115);
    expect(r.totalMismatch).not.toBeNull();
    expect(r.totalMismatch?.deltaCents).toBe(-1500);
  });

  it("still drops a row whose sum_total is exactly 0", () => {
    // Consultation 18 / invoice 27: row 88 "PureVax DH2PP Vaccine" is 0.00 and
    // the header is 75.00. A zero line changes no total, and Siigo's payload
    // schema rejects `taxed_price: 0` exactly as it rejects a negative, so
    // letting it through would break ten consultations that emit fine today.
    // Representing it as a giveaway needs `tax_base`/`taxpayer`: separate work.
    const consultation18 = con({ id: "18", invoice: "https://api.provet.test/invoice/27/" });
    const invoice27 = inv({
      id: "I-27", url: "https://api.provet.test/invoice/27/",
      consultation: "https://api.provet.test/consultation/18/",
      credit_note: false, original_consultation: null,
      total: 75, total_vat: 0, total_with_vat: 75,
    });
    const paid = row({ url: "https://api.provet.test/invoicerow/87/", invoice: "https://api.provet.test/invoice/27/", item: "https://api.provet.test/item/40/", name: "Exam Consultation", quantity: 1, price_with_vat: 75, sum_total: 75 });
    const free = row({ url: "https://api.provet.test/invoicerow/88/", invoice: "https://api.provet.test/invoice/27/", item: "https://api.provet.test/item/41/", name: "PureVax DH2PP Vaccine", quantity: 1, price_with_vat: 0, sum_total: 0 });
    const r = buildQueueFromProvet([consultation18], [cli()], [pat()], [invoice27], [], [], [paid, free])[0];
    expect(r.items.map((i) => i.lineTotal)).toEqual([75]);
    expect(r.totalMismatch).toBeNull();
  });

  it("does NOT silently drop a row whose sum_total is not finite", () => {
    // Two layers, the same shape C-11 established: the mapper MARKS (it keeps
    // the value, so the row stays visible and the consultation stops
    // reconciling) and `buildInvoicePayloadFromQuickEdit` THROWS. The throw
    // does not live here: `buildQueueFromProvet` must not throw, or one
    // corrupt row blanks the queue for all 39 consultations — decided in
    // C-11, `PROJECT_STATE.md -> Resolved sesion 2`, layer 1.
    //
    // Reachability, measured against the real schema on 2026-09-11:
    //   "abc" / NaN -> REJECTED, "Expected number, received nan". The parse is
    //                  a safeParse over the whole page, so one bad row already
    //                  fails the fetch loudly with ProvetApiError parse_failed.
    //   Infinity    -> ACCEPTED. A JSON number that overflows a double reaches
    //                  the mapper intact. This is the live path.
    const broken = row({ url: "https://api.provet.test/invoicerow/99/", invoice: "https://api.provet.test/invoice/15/", item: "https://api.provet.test/item/13/", name: "Rota", quantity: 1, sum_total: Number.POSITIVE_INFINITY });
    const r = buildQueueFromProvet([consultation9], [cli()], [pat()], [invoice15], [], [], [row43, broken])[0];
    expect(r.items).toHaveLength(2);
    expect(r.items[1].lineTotal).toBe(Number.POSITIVE_INFINITY);
    expect(r.totalMismatch).not.toBeNull();
  });
});
