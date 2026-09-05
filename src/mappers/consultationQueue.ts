import { z } from "zod";
import {
  hasMaxDecimals,
  identificationSchema,
  identificationTypes,
  type Client,
  type Consultation,
  type Patient,
} from "@/schemas/provet";
import type { SiigoInvoicePayload } from "@/schemas/siigo";
import { provetToSiigoInvoice, type ProvetToSiigoOptions } from "@/mappers/provetToSiigo";
import type { CatalogMapping } from "@/mappers/catalogMapping";

/** DIAN invoice lifecycle status, surfaced per consultation row. */
export type InvoiceStatus = "Accepted" | "Draft" | "Rejected" | "Annulled";

/** Provet consultation readiness, rendered as a muted sublabel. */
export type ProvetStatus = "pending" | "closed";

/** Joined consultation row consumed by the queue UI (no mapping inside components). */
/** Editable line item view-model for the Quick-Edit drawer (tax-inclusive line total). */
export interface QuickEditItem { code: string; name: string; quantity: number; lineTotal: number; }

export interface ConsultationQueueRow {
  id: string; clientId: string; clientName: string; clientDoc: string;
  /** Colombian document type inferred from Provet's client record — see provetToQueue.ts. */
  identificationType: (typeof identificationTypes)[number];
  identificationNumber: string;
  email: string;
  phone: string;
  /** Real line items from Provet's /consultationitem/ (hidden items excluded) — empty when Provet has none. */
  items: QuickEditItem[];
  patientName: string; total: number; paymentMethod: string;
  provetStatus: ProvetStatus; invoiceStatus: InvoiceStatus; createdAt: Date;
}

/** COP currency formatter (es-CO grouping, deterministic "$95.200"). */
export const formatCOP = (value: number): string =>
  `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value)}`;

/** Deterministic short ISO date (YYYY-MM-DD), locale-independent. */
export const formatDate = (value: Date): string => new Date(value).toISOString().slice(0, 10);

/** Active mapped payment option for the Quick-Edit drawer dropdown. */
export interface PaymentOption {
  provetMethod: string;
  siigoPaymentTypeId: number;
}

/** Pure O(n) join into queue rows; invoiceStatus defaults to "Draft" until an invoice is linked. */
export function buildConsultationQueue(consultations: Consultation[], clients: Client[], patients: Patient[]): ConsultationQueueRow[] {
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const patientMap = new Map(patients.map((p) => [p.id, p]));
  return consultations.map((c) => {
    const client = clientMap.get(c.client_id);
    const patient = patientMap.get(c.patient_id);
    return {
      id: c.id, clientId: c.client_id,
      clientName: client?.name ?? "Cliente desconocido",
      clientDoc: client ? `${client.identification.type} ${client.identification.number}` : "—",
      identificationType: client?.identification.type ?? "CC",
      identificationNumber: client?.identification.number ?? "",
      email: client?.email ?? "",
      phone: client?.phone ?? "",
      items: c.items.map((i) => ({ code: i.code, name: i.name, quantity: i.quantity, lineTotal: i.unit_price * i.quantity * (1 + i.tax_rate) - i.discount })),
      patientName: patient?.name ?? "Paciente desconocido",
      total: c.total, paymentMethod: c.payment_method,
      provetStatus: c.status, invoiceStatus: "Draft", createdAt: c.created_at,
    };
  });
}

/** Editable line item view-model for the Quick-Edit drawer (tax-inclusive line total). */

/** Pre-filled Provet detail consumed by the Quick-Edit drawer (no fetch in UI). */
export interface QuickEditDetail {
  id: string; clientName: string;
  identificationType: (typeof identificationTypes)[number];
  identificationNumber: string;
  email: string; phone: string; patientName: string;
  paymentMethod: string; paymentMethodOptions: PaymentOption[];
  total: number; items: QuickEditItem[]; createdAt: Date;
}

/** Zod schema for the Quick-Edit form (reuses identificationSchema for NIT/Cédula rules). */
export const quickEditFormSchema = z
  .object({
    name: z.string().trim().min(1, "Nombre del cliente requerido").max(100),
    identificationType: z.enum(identificationTypes),
    identificationNumber: z.string().trim().min(1, "Identificación requerida"),
    email: z.string().trim().email("Correo electrónico inválido"),
    phone: z.string().trim().min(7, "Teléfono debe tener al menos 7 dígitos").max(20),
    paymentMethod: z.string().trim().min(1, "Método de pago requerido"),
    paidAmount: z.number().positive("El monto pagado debe ser positivo").refine((n) => hasMaxDecimals(n, 2), "Monto pagado max 2 decimales"),
  })
  .superRefine((data, ctx) => {
    const r = identificationSchema.safeParse({ type: data.identificationType, number: data.identificationNumber });
    if (!r.success) r.error.issues.forEach((i) => ctx.addIssue({ code: z.ZodIssueCode.custom, message: i.message, path: ["identificationNumber"] }));
  });

export type QuickEditFormValues = z.infer<typeof quickEditFormSchema>;

/** Build active mapped payment options from the catalog mapping (non-null ids only). */
export function buildPaymentOptions(mapping?: CatalogMapping): PaymentOption[] {
  if (!mapping) return [];
  return mapping.payments
    .filter((p): p is { provetMethod: string; siigoPaymentTypeId: number } => p.siigoPaymentTypeId !== null);
}

/** Pure O(n) lookup building the Quick-Edit detail; `undefined` for unknown id or missing client. */
export function buildQuickEditDetail(consultations: Consultation[], clients: Client[], patients: Patient[], id: string, mapping?: CatalogMapping): QuickEditDetail | undefined {
  const consultation = consultations.find((c) => c.id === id);
  if (!consultation) return undefined;
  const client = clients.find((c) => c.id === consultation.client_id);
  const patient = patients.find((p) => p.id === consultation.patient_id);
  const paymentMethodOptions = buildPaymentOptions(mapping);
  return {
    id: consultation.id,
    clientName: client?.name ?? "Cliente desconocido",
    identificationType: client?.identification.type ?? "CC",
    identificationNumber: client?.identification.number ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    patientName: patient?.name ?? "Paciente desconocido",
    paymentMethod: "", paymentMethodOptions,
    total: consultation.total, createdAt: consultation.created_at,
    items: consultation.items.map((i) => ({ code: i.code, name: i.name, quantity: i.quantity, lineTotal: i.unit_price * i.quantity * (1 + i.tax_rate) - i.discount })),
  };
}

/**
 * Collapse a Provet billing line into the shape Siigo can represent.
 *
 * Siigo caps `items.quantity` at 2 decimals, but Provet dispensing quantities
 * routinely carry 3 (0.028 of a bottle, 0.083 of a can). Sending them verbatim
 * gets the line rejected or silently truncated — and a truncated quantity
 * changes the amount on a legal document.
 *
 * So the whole line is billed as ONE unit priced at the amount Provet charged.
 * `quantity * price` then reproduces `lineTotal` exactly, with no rounding
 * drift for Siigo's own `Redondear(Cantidad * ValorUnitario - Descuento, 2)`
 * check against the payments total.
 *
 * The dispensed fraction is not lost: it moves into the description, so the
 * DIAN invoice still shows what was actually administered.
 */
function toSiigoLine(it: QuickEditItem): Consultation["items"][number] {
  const isWholeUnit = Number.isInteger(it.quantity) && it.quantity === 1;
  const name = isWholeUnit ? it.name : `${it.name} (${it.quantity})`;
  return {
    code: it.code,
    // consultationItemSchema caps name at 100 chars.
    name: name.slice(0, 100),
    quantity: 1,
    unit_price: it.lineTotal,
    tax_rate: 0,
    discount: 0,
  };
}

export function buildInvoicePayloadFromQuickEdit(
  consultations: Consultation[], clients: Client[], patients: Patient[],
  id: string, values: QuickEditFormValues, options?: ProvetToSiigoOptions, fallbackDetail?: QuickEditDetail,
): SiigoInvoicePayload | undefined {
  const consultation = consultations.find((c) => c.id === id);
  const client = consultation ? clients.find((c) => c.id === consultation.client_id) : undefined;
  const patient = consultation ? patients.find((p) => p.id === consultation.patient_id) : undefined;

  if (consultation && client) {
    const overriddenClient: Client = { ...client, name: values.name, identification: { type: values.identificationType, number: values.identificationNumber }, email: values.email, phone: values.phone };
    const overriddenConsultation: Consultation = { ...consultation, payment_method: values.paymentMethod };
    return provetToSiigoInvoice(overriddenConsultation, overriddenClient, patient ?? { id: consultation.patient_id, name: "Paciente desconocido", species: "—", owner_id: client.id }, options);
  }
  if (!fallbackDetail) return undefined;

  const syntheticConsultation: Consultation = {
    id: fallbackDetail.id, client_id: `CLI-${fallbackDetail.id}`, patient_id: `PAT-${fallbackDetail.id}`,
    items: fallbackDetail.items.length > 0 ? fallbackDetail.items.map(toSiigoLine) : [],
    subtotal: fallbackDetail.total, tax_total: 0, total: fallbackDetail.total,
    payment_method: values.paymentMethod, status: "closed",
    created_at: fallbackDetail.createdAt, updated_at: fallbackDetail.createdAt,
  };
  const syntheticClient: Client = { id: `CLI-${fallbackDetail.id}`, name: values.name, identification: { type: values.identificationType, number: values.identificationNumber }, email: values.email, address: "—", phone: values.phone, client_type: "natural" };
  const syntheticPatient: Patient = { id: `PAT-${fallbackDetail.id}`, name: fallbackDetail.patientName, species: "Canino", owner_id: `CLI-${fallbackDetail.id}` };
  return provetToSiigoInvoice(syntheticConsultation, syntheticClient, syntheticPatient, options);
}