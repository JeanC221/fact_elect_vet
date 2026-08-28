import type {
  ProvetConsultationRaw,
  ProvetClientRaw,
  ProvetPatientRaw,
  ProvetInvoiceRaw,
} from "@/schemas/provetApi";
import type { ConsultationQueueRow, InvoiceStatus, ProvetStatus } from "@/mappers/consultationQueue";

/**
 * If a relation value is a hyperlinked URL, return its trailing id segment;
 * otherwise return the value unchanged (it is already a bare id). Provet
 * relations may be either form depending on the serializer.
 */
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

/**
 * Pure O(n) join of Provet raw resources into dashboard queue rows.
 * Resolves client/patient names and the linked invoice total; sets
 * `provetStatus` to "closed" when the consultation has a finished date or
 * a linked invoice, otherwise "pending".
 */
export function buildQueueFromProvet(
  consultations: ProvetConsultationRaw[],
  clients: ProvetClientRaw[],
  patients: ProvetPatientRaw[],
  invoices: ProvetInvoiceRaw[],
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

  return consultations.map((con): ConsultationQueueRow => {
    const clientKey = extractId(con.client);
    const client = clientKey ? clientById.get(clientKey) ?? undefined : undefined;
    const patientKey = extractId(con.patients[0]);
    const patient = patientKey ? patientById.get(patientKey) : undefined;
    const invoice = invoiceByConsultation.get(con.id);
    const provetStatus: ProvetStatus = con.finished || invoice ? "closed" : "pending";
    return {
      id: con.id,
      clientId: con.client ?? "",
      clientName: clientName(client),
      clientDoc: clientDoc(client),
      patientName: patient?.name ?? "Paciente desconocido",
      total: invoice?.total_with_vat ?? invoice?.total ?? 0,
      paymentMethod: "—",
      provetStatus,
      invoiceStatus: "Draft",
      createdAt: new Date(con.created),
    };
  });
}

/**
 * Merge freshly polled rows into the existing queue preserving the DIAN
 * `invoiceStatus` of rows already processed (Accepted/Draft/Rejected) so a
 * manual refresh never wipes emission badges. Pure O(n).
 */
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
