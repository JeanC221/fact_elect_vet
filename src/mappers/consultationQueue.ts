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
import { PAYMENT_METHOD_MAP, provetToSiigoInvoice, type ProvetToSiigoOptions } from "@/mappers/provetToSiigo";

/** DIAN invoice lifecycle status, surfaced per consultation row. */
export type InvoiceStatus = "Accepted" | "Draft" | "Rejected" | "Annulled";

/** Provet consultation readiness, rendered as a muted sublabel. */
export type ProvetStatus = "pending" | "closed";

/** Joined consultation row consumed by the queue UI (no mapping inside components). */
export interface ConsultationQueueRow {
  id: string; clientId: string; clientName: string; clientDoc: string;
  patientName: string; total: number; paymentMethod: string;
  provetStatus: ProvetStatus; invoiceStatus: InvoiceStatus; createdAt: Date;
}

/** COP currency formatter (es-CO grouping, deterministic "$95.200"). */
export const formatCOP = (value: number): string =>
  `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value)}`;

/** Deterministic short ISO date (YYYY-MM-DD), locale-independent. */
export const formatDate = (value: Date): string => new Date(value).toISOString().slice(0, 10);

/** Pure O(n) join into queue rows; invoiceStatus defaults to "Draft" until an invoice is linked. */
export function buildConsultationQueue(
  consultations: Consultation[],
  clients: Client[],
  patients: Patient[],
): ConsultationQueueRow[] {
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const patientMap = new Map(patients.map((p) => [p.id, p]));

  return consultations.map((c) => {
    const client = clientMap.get(c.client_id);
    const patient = patientMap.get(c.patient_id);
    return {
      id: c.id, clientId: c.client_id,
      clientName: client?.name ?? "Cliente desconocido",
      clientDoc: client ? `${client.identification.type} ${client.identification.number}` : "—",
      patientName: patient?.name ?? "Paciente desconocido",
      total: c.total, paymentMethod: c.payment_method,
      provetStatus: c.status, invoiceStatus: "Draft", createdAt: c.created_at,
    };
  });
}

/** Editable line item view-model for the Quick-Edit drawer (tax-inclusive line total). */
export interface QuickEditItem { code: string; name: string; quantity: number; lineTotal: number; }

/** Pre-filled Provet detail consumed by the Quick-Edit drawer (no fetch in UI). */
export interface QuickEditDetail {
  id: string; clientName: string;
  identificationType: (typeof identificationTypes)[number];
  identificationNumber: string;
  email: string; address: string; patientName: string;
  paymentMethod: string; paymentMethodOptions: string[];
  total: number; items: QuickEditItem[]; createdAt: Date;
}

/** Zod schema for the Quick-Edit form (reuses identificationSchema for NIT/Cédula rules). */
export const quickEditFormSchema = z
  .object({
    identificationType: z.enum(identificationTypes),
    identificationNumber: z.string().trim().min(1, "Identificación requerida"),
    email: z.string().trim().email("Correo electrónico inválido"),
    address: z.string().trim().min(1, "Dirección requerida"),
    paymentMethod: z.string().trim().min(1, "Método de pago requerido"),
    paidAmount: z.number().positive("El monto pagado debe ser positivo").refine((n) => hasMaxDecimals(n, 2), "Monto pagado max 2 decimales"),
  })
  .superRefine((data, ctx) => {
    const r = identificationSchema.safeParse({ type: data.identificationType, number: data.identificationNumber });
    if (!r.success) r.error.issues.forEach((i) => ctx.addIssue({ code: z.ZodIssueCode.custom, message: i.message, path: ["identificationNumber"] }));
  });

export type QuickEditFormValues = z.infer<typeof quickEditFormSchema>;

/** Pure O(n) lookup building the Quick-Edit detail; `undefined` for unknown id or missing client. */
export function buildQuickEditDetail(
  consultations: Consultation[],
  clients: Client[],
  patients: Patient[],
  id: string,
): QuickEditDetail | undefined {
  const consultation = consultations.find((c) => c.id === id);
  if (!consultation) return undefined;
  const client = clients.find((c) => c.id === consultation.client_id);
  if (!client) return undefined;
  const patient = patients.find((p) => p.id === consultation.patient_id);

  const opts = Object.keys(PAYMENT_METHOD_MAP);
  const paymentMethodOptions = opts.includes(consultation.payment_method) ? opts : [consultation.payment_method, ...opts];

  return {
    id: consultation.id, clientName: client.name,
    identificationType: client.identification.type,
    identificationNumber: client.identification.number,
    email: client.email, address: client.address,
    patientName: patient?.name ?? "Paciente desconocido",
    paymentMethod: consultation.payment_method, paymentMethodOptions,
    total: consultation.total, createdAt: consultation.created_at,
    items: consultation.items.map((i) => ({ code: i.code, name: i.name, quantity: i.quantity, lineTotal: i.unit_price * i.quantity * (1 + i.tax_rate) - i.discount })),
  };
}

/** Pure O(n) composition: form overrides + Provet trio → Siigo payload. */
export function buildInvoicePayloadFromQuickEdit(
  consultations: Consultation[],
  clients: Client[],
  patients: Patient[],
  id: string,
  values: QuickEditFormValues,
  options?: ProvetToSiigoOptions,
): SiigoInvoicePayload | undefined {
  const consultation = consultations.find((c) => c.id === id);
  if (!consultation) return undefined;
  const client = clients.find((c) => c.id === consultation.client_id);
  if (!client) return undefined;
  const patient = patients.find((p) => p.id === consultation.patient_id);

  const overriddenClient: Client = {
    ...client,
    identification: { type: values.identificationType, number: values.identificationNumber },
    email: values.email,
    address: values.address,
  };
  const overriddenConsultation: Consultation = { ...consultation, payment_method: values.paymentMethod };
  const fallbackPatient: Patient = { id: consultation.patient_id, name: "Paciente desconocido", species: "—", owner_id: client.id };

  return provetToSiigoInvoice(overriddenConsultation, overriddenClient, patient ?? fallbackPatient, options);
}