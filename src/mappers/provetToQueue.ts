import type {
  ProvetConsultationRaw,
  ProvetClientRaw,
  ProvetPatientRaw,
  ProvetInvoiceRaw,
  ProvetPhoneNumberRaw,
  ProvetConsultationItemRaw,
  ProvetInvoiceRowRaw,
} from "@/schemas/provetApi";
import type { ConsultationQueueRow, InvoiceStatus, ProvetStatus, QuickEditItem } from "@/mappers/consultationQueue";
import { detectTotalMismatch } from "@/mappers/consultationQueue";
import { identificationTypes } from "@/schemas/provet";

export function extractId(rel: string | null | undefined): string | null {
  if (!rel) return null;
  const trimmed = rel.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const seg = trimmed.replace(/\/+$/, "").split("/").pop();
    return seg && seg.length > 0 ? seg : trimmed;
  }
  return trimmed;
}

const clientName = (c: ProvetClientRaw | undefined): string => {
  if (!c) return "Cliente desconocido";
  const org = c.organization_name.trim();
  if (org) return org;
  return `${c.firstname} ${c.lastname}`.trim() || "Cliente sin nombre";
};

const clientDoc = (c: ProvetClientRaw | undefined): string => {
  if (!c) return "—";
  return c.vat_number?.trim() || c.id_number?.trim() || "—";
};

function pickPhoneNumber(candidates: ProvetPhoneNumberRaw[] | undefined): string {
  if (!candidates || candidates.length === 0) return "";
  const best = [...candidates].sort((a, b) => {
    if (a.is_secondary_owners_phone_number !== b.is_secondary_owners_phone_number) {
      return a.is_secondary_owners_phone_number ? 1 : -1;
    }
    return b.type_code - a.type_code; // mobile (1) before landline (0)
  })[0];
  return best.phone_number.trim();
}

type IdType = (typeof identificationTypes)[number];

function inferIdentification(c: ProvetClientRaw | undefined): { type: IdType; number: string } {
  if (!c) return { type: "CC", number: "" };
  const isCompany = c.organization_name.trim().length > 0;
  if (isCompany) {
    const nit = c.vat_number?.trim() || c.id_number?.trim() || "";
    return { type: "NIT", number: nit };
  }
  const personal = c.id_number?.trim() || c.vat_number?.trim() || "";
  return { type: "CC", number: personal };
}

export function buildQueueFromProvet(
  consultations: ProvetConsultationRaw[],
  clients: ProvetClientRaw[],
  patients: ProvetPatientRaw[],
  invoices: ProvetInvoiceRaw[],
  phoneNumbers: ProvetPhoneNumberRaw[] = [],
  consultationItems: ProvetConsultationItemRaw[] = [],
  invoiceRows: ProvetInvoiceRowRaw[] = [],
): ConsultationQueueRow[] {
  // `consultationitem` is the CLINICAL record and is no longer the source of
  // billing amounts — see provetInvoiceRowRawSchema for the measured evidence
  // (19 of 33 consultations mis-billed, in both directions). It is still
  // fetched by /api/consultations and kept in the signature because the dose
  // detail it carries (usage_size, usage_type) is wanted for the invoice
  // description in a follow-up change.
  void consultationItems;
  const clientById = new Map<string, ProvetClientRaw>();
  for (const c of clients) {
    clientById.set(c.id, c);
    const urlId = extractId(c.url);
    if (urlId) clientById.set(urlId, c);
  }
  const patientById = new Map<string, ProvetPatientRaw>();
  for (const p of patients) {
    patientById.set(p.id, p);
    const urlId = extractId(p.url);
    if (urlId) patientById.set(urlId, p);
  }
  const invoiceByConsultation = new Map<string, ProvetInvoiceRaw>();
  for (const inv of invoices) {
    const cid = extractId(inv.consultation);
    if (cid) invoiceByConsultation.set(cid, inv);
  }
  const phonesByClient = new Map<string, ProvetPhoneNumberRaw[]>();
  for (const ph of phoneNumbers) {
    const cid = extractId(ph.client);
    if (!cid) continue;
    const list = phonesByClient.get(cid) ?? [];
    list.push(ph);
    phonesByClient.set(cid, list);
  }
  // Line items are built from the INVOICE rows, joined to the consultation
  // through the invoice. `sum_total` is read verbatim: it is the amount Provet
  // itself charges, already accounting for dosage units, package sizes and
  // dispensing rules that cannot be reconstructed from quantity * price.
  //
  // C-1: a Provet credit note is a separate `invoice` record that always
  // carries `consultation: null`, so joining on `consultation` alone dropped
  // every credit note on the floor and queued the consultation at its gross
  // amount. The reversed consultation is named by `original_consultation`.
  //
  // Measured 2026-09-11 over the 52 invoices of the tenant: 8 credit notes;
  // `original_consultation` appears on credit notes only and never on an
  // ordinary invoice, so this fallback cannot steal a row from a consultation
  // that owns it; and in the 6 notes that reach a consultation it agrees with
  // walking `credit_note_original_invoice -> invoice -> consultation`, while
  // the other 2 are null by both routes because they credit documents with no
  // consultation. Hence one hop and no fallback chain.
  //
  // Deliberately NOT applied to `invoiceByConsultation` above: that map feeds
  // the queue row's `total`, and a credit note's header is not the
  // consultation's invoice. Letting it in would overwrite 1699.04 with 125.00.
  const consultationByInvoiceId = new Map<string, string>();
  for (const inv of invoices) {
    const cid = extractId(inv.consultation) ?? extractId(inv.original_consultation);
    const invId = extractId(inv.url) ?? inv.id;
    if (cid && invId) consultationByInvoiceId.set(invId, cid);
  }
  const itemsByConsultation = new Map<string, QuickEditItem[]>();
  for (const r of invoiceRows) {
    const invId = extractId(r.invoice);
    if (!invId) continue;
    const cid = consultationByInvoiceId.get(invId);
    if (!cid) continue; // row belongs to an invoice with no linked consultation
    const lineTotal = r.sum_total;
    // C-2. The old guard was `!Number.isFinite(lineTotal) || lineTotal <= 0`,
    // which collapsed three unrelated cases into one silent `continue`:
    //
    //  NEGATIVE — real money. These are the credit-note lines that C-1 now
    //    routes here, and dropping them makes the rest reconcile with the
    //    header again, so the C-11 guard sees nothing and the consultation is
    //    billed gross. Measured 2026-09-11 on the tenant: consulta #1 emits
    //    2870.00 instead of 2682.50, #9 115.00 instead of 100.00, #10 24.11
    //    instead of 0.00, #20 3344.38 instead of 2513.24. 1057.75 overbilled
    //    across four consultations, all of it DIAN-stamped. Kept from now on.
    //
    //  ZERO — still dropped, and that is deliberate. Ten consultations (#18,
    //    #23, #24, #28, #30, #32, #33, #34, #35, #36) carry a 0.00 line, always
    //    the same item. Keeping it moves no total, and Siigo rejects it exactly
    //    as it rejects a negative: `siigoInvoicePayloadSchema.taxed_price` is
    //    `positive()`, measured 0 -> "Number must be greater than 0". Rendering
    //    a giveaway needs `items.tax_base` and `items.taxpayer`, which exist in
    //    neither the schema nor `provetToSiigo.ts`. Removing this branch would
    //    trade 4 mis-billed consultations for 10 that stop emitting at all.
    //
    //  NON-FINITE — corrupt data, and dropping it silently is the failure this
    //    project forbids. The value is kept so the consultation stops
    //    reconciling and `buildInvoicePayloadFromQuickEdit` throws by name. The
    //    throw is NOT here: `buildQueueFromProvet` must not throw, or a single
    //    bad row blanks the queue for every consultation (C-11, layer 1).
    //    Only `Infinity` reaches this point; `NaN` is already rejected by
    //    `provetInvoiceRowRawSchema`, which fails the whole page fetch.
    if (lineTotal === 0) continue;
    const list = itemsByConsultation.get(cid) ?? [];
    // The stable catalog key is the Provet item id, not the row id: row ids
    // are regenerated per invoice and would never match a saved mapping twice.
    const itemCode = extractId(r.item) || `ROW-${extractId(r.url) ?? list.length}`;
    list.push({ code: itemCode, name: r.name, quantity: r.quantity, lineTotal });
    itemsByConsultation.set(cid, list);
  }

  return consultations.map((con): ConsultationQueueRow => {
    const clientKey = extractId(con.client);
    const client = clientKey ? clientById.get(clientKey) ?? undefined : undefined;
    const patientKey = extractId(con.patients[0]);
    const patient = patientKey ? patientById.get(patientKey) : undefined;
    const invoice = invoiceByConsultation.get(con.id);
    const provetStatus: ProvetStatus = con.finished || invoice ? "closed" : "pending";
    const { type: identificationType, number: identificationNumber } = inferIdentification(client);
    const items = itemsByConsultation.get(con.id) ?? [];
    const total = invoice?.total_with_vat ?? invoice?.total ?? 0;
    return {
      id: con.id,
      clientId: con.client ?? "",
      clientName: clientName(client),
      clientDoc: clientDoc(client),
      identificationType,
      identificationNumber,
      email: client?.email?.trim() || "",
      phone: clientKey ? pickPhoneNumber(phonesByClient.get(clientKey)) : "",
      items,
      patientName: patient?.name ?? "Paciente desconocido",
      total,
      paymentMethod: "Pendiente",
      provetStatus,
      invoiceStatus: "Draft",
      createdAt: new Date(con.created),
      totalMismatch: detectTotalMismatch(total, items),
    };
  });
}

export function mergeQueueRows(
  prev: ConsultationQueueRow[],
  fresh: ConsultationQueueRow[],
): ConsultationQueueRow[] {
  const status = new Map(prev.map((r) => [r.id, r.invoiceStatus] as const));
  const known: InvoiceStatus[] = ["Accepted", "Draft", "Rejected", "Annulled"];
  return fresh.map((r) => {
    const prevStatus = status.get(r.id);
    return prevStatus && known.includes(prevStatus) ? { ...r, invoiceStatus: prevStatus } : r;
  });
}