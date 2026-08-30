import type {
  ProvetConsultationRaw,
  ProvetClientRaw,
  ProvetPatientRaw,
  ProvetInvoiceRaw,
  ProvetPhoneNumberRaw,
  ProvetConsultationItemRaw,
} from "@/schemas/provetApi";
import type { ConsultationQueueRow, InvoiceStatus, ProvetStatus, QuickEditItem } from "@/mappers/consultationQueue";
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
): ConsultationQueueRow[] {
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
  // Real billable line items, grouped by consultation. `hide_on_consultation`
  // items are internal notes/steps, not billable — never sent to Siigo.
  const itemsByConsultation = new Map<string, QuickEditItem[]>();
  for (const it of consultationItems) {
    if (it.hide_on_consultation) continue;
    const cid = extractId(it.consultation);
    if (!cid) continue;
    const list = itemsByConsultation.get(cid) ?? [];
    const unitPriceWithVat = it.price_with_vat || it.price * (1 + it.vat_percentage / 100);
    list.push({ code: it.code || it.id, name: it.name, quantity: it.quantity, lineTotal: unitPriceWithVat * it.quantity });
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
    return {
      id: con.id,
      clientId: con.client ?? "",
      clientName: clientName(client),
      clientDoc: clientDoc(client),
      identificationType,
      identificationNumber,
      email: client?.email?.trim() || "",
      phone: clientKey ? pickPhoneNumber(phonesByClient.get(clientKey)) : "",
      items: itemsByConsultation.get(con.id) ?? [],
      patientName: patient?.name ?? "Paciente desconocido",
      total: invoice?.total_with_vat ?? invoice?.total ?? 0,
      paymentMethod: "Pendiente",
      provetStatus,
      invoiceStatus: "Draft",
      createdAt: new Date(con.created),
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