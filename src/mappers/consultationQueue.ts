import { z } from "zod";
import {
  hasMaxDecimals,
  toCents,
  formatColombiaDate,
  identificationSchema,
  identificationTypes,
  type Client,
  type Consultation,
  type Patient,
} from "@/schemas/provet";
import type { SiigoInvoicePayload } from "@/schemas/siigo";
import { provetToSiigoInvoice, TotalMismatchError, ReversedConsultationError, CorruptInvoiceRowError, type ProvetToSiigoOptions } from "@/mappers/provetToSiigo";
import type { CatalogMapping } from "@/mappers/catalogMapping";

/** DIAN invoice lifecycle status, surfaced per consultation row. */
export type InvoiceStatus = "Accepted" | "Draft" | "Rejected" | "Annulled";

/** Provet consultation readiness, rendered as a muted sublabel. */
export type ProvetStatus = "pending" | "closed";

/** Joined consultation row consumed by the queue UI (no mapping inside components). */
/** Editable line item view-model for the Quick-Edit drawer (tax-inclusive line total). */
export interface QuickEditItem { code: string; name: string; quantity: number; lineTotal: number; }

/**
 * C-11 — a measured disagreement between the two independent amounts Provet
 * gives us for the same consultation: the invoice header (`total_with_vat`,
 * which becomes `row.total`) and the invoice rows (`sum_total`, which become
 * `row.items`). Until this field existed, nothing in the codebase ever
 * compared them, and `EVIDENCIA §2.6` calls that assert the highest-return
 * control in the backlog.
 *
 * `null` means the two agree to the cent. Anything else means one of the two
 * is wrong and we cannot tell which, so the consultation must not be emitted:
 * either amount could be the one the DIAN stamps.
 */
export interface QueueTotalMismatch {
  /** `invoice.total_with_vat`, verbatim. */
  expectedTotal: number;
  /** Sum of the line totals this code actually built for the consultation. */
  itemsTotal: number;
  /**
   * `itemsTotal - expectedTotal` in whole cents. Integer on purpose: a float
   * delta in a fiscal control is a number nobody can justify six months later.
   */
  deltaCents: number;
}

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
  /** C-11 guard. `null` when header and rows agree to the cent, OR when `fullyReversed` is true — see below. */
  totalMismatch: QueueTotalMismatch | null;
  /**
   * C-16 — an invoice and its credit note cancel each other to the cent
   * (`detectFullReversal`). Mutually exclusive with `totalMismatch`: a
   * reversed consultation is not a disagreement between two numbers, it is
   * two correct numbers that sum to zero. Kept as its own field rather than
   * folded into `totalMismatch` so the UI can tell "nothing to review" apart
   * from "something is wrong and we don't know what."
   */
  fullyReversed: boolean;
}

/**
 * C-16 — Σ items == 0 while the Provet header (`total`) still carries the
 * original, pre-reversal amount. A consultation billed and then reversed in
 * full (its invoice and credit note cancel to the cent) computes a correct
 * net of zero from lines the code deliberately kept (C-1 routes the credit
 * note here, C-2 stops discarding its negative rows). This is NOT a
 * disagreement between Provet's two accounts — both are correct — so it must
 * be detected and named before `detectTotalMismatch` below can misread it as
 * one.
 *
 * Sign-convention independent on purpose: whatever combination of positive
 * and negative lines nets to zero cents counts, not just "one positive line
 * plus one canceling negative line."
 *
 * `expectedTotal === 0` is excluded: a consultation with a genuinely zero
 * header and no lines is not a reversal, it is simply empty (and
 * `EmptyConsultationError` already covers emitting it).
 *
 * `items.length === 0` is ALSO excluded, and deliberately not merged with the
 * check above: an invoice with a header total and NO rows behind it at all
 * (Provet dropped every line, or the fetch never populated them) is the
 * pre-existing C-11 case — flagged as a mismatch on purpose, precisely
 * because it would otherwise sail through with 0 == 0. A genuine C-16
 * reversal always has real, opposite-signed lines behind the net zero; an
 * empty array is a different failure with a different guard already
 * covering it.
 */
export function detectFullReversal(expectedTotal: number, items: QuickEditItem[]): boolean {
  if (items.length === 0) return false;
  const itemsCents = toCents(items.reduce((acc, i) => acc + i.lineTotal, 0));
  const expectedCents = toCents(expectedTotal);
  return itemsCents === 0 && expectedCents !== 0;
}

/**
 * C-11 — compare the invoice header against the lines this code actually kept.
 *
 * Two things this deliberately does NOT do:
 *
 * 1. It does not compare the RAW Provet rows against `total_with_vat`. Provet's
 *    own arithmetic is self-consistent, so that comparison passes on invoice 12
 *    of the live tenant while the queue still bills 187.50 against a header of
 *    158.28. The number that matters is the one the code produced.
 * 2. It does not use a float tolerance. `toCents` is the repo's existing drift
 *    absorber (`provet.ts:29`), applied here in exactly the shape it already
 *    has in `provet.ts:116` — round both sides once, compare integers — rather
 *    than rounding each line first, which would be a new and different rule.
 *
 * No special cases: a consultation with no invoice compares 0 against 0 and
 * passes on its own arithmetic, and an invoice carrying a header total with no
 * rows behind it is flagged, which is what we want — emitting it would hit
 * `EmptyConsultationError` anyway.
 *
 * C-16: checked first. A fully reversed consultation (see `detectFullReversal`)
 * is deliberately reported as `null` here — not a mismatch — so the caller must
 * use `detectFullReversal` separately to tell "nothing to review" apart from
 * "these two numbers disagree."
 */
export function detectTotalMismatch(expectedTotal: number, items: QuickEditItem[]): QueueTotalMismatch | null {
  if (detectFullReversal(expectedTotal, items)) return null;
  const itemsCents = toCents(items.reduce((acc, i) => acc + i.lineTotal, 0));
  const expectedCents = toCents(expectedTotal);
  if (itemsCents === expectedCents) return null;
  const itemsTotal = itemsCents / 100;
  return { expectedTotal, itemsTotal, deltaCents: itemsCents - expectedCents };
}

/** COP currency formatter (es-CO grouping, deterministic "$95.200"). */
export const formatCOP = (value: number): string =>
  `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value)}`;

/**
 * Deterministic short date (YYYY-MM-DD) rendered in Colombia time (UTC-5, no
 * DST year-round). `Date#toISOString()` returns UTC, which is already the next
 * calendar day in Colombia from ~7pm COT onwards: a consultation created at
 * 21:00 COT would be displayed to reception under tomorrow's date. Same bug,
 * same day boundary, as the one already fixed in `provetToSiigo.ts`.
 *
 * Display only. Sorting and filtering operate on the underlying `Date`
 * (`tableSort.ts` compares `getTime()`; `filterInvoiceHistory` never reads a
 * date), so shifting the rendered day does not move any row.
 */
export const formatDate = (value: Date): string =>
  formatColombiaDate(new Date(value));

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
    const items = c.items.map((i) => ({ code: i.code, name: i.name, quantity: i.quantity, lineTotal: i.unit_price * i.quantity * (1 + i.tax_rate) - i.discount }));
    return {
      id: c.id, clientId: c.client_id,
      clientName: client?.name ?? "Cliente desconocido",
      clientDoc: client ? `${client.identification.type} ${client.identification.number}` : "—",
      identificationType: client?.identification.type ?? "CC",
      identificationNumber: client?.identification.number ?? "",
      email: client?.email ?? "",
      phone: client?.phone ?? "",
      items,
      patientName: patient?.name ?? "Paciente desconocido",
      total: c.total, paymentMethod: c.payment_method,
      provetStatus: c.status, invoiceStatus: "Draft", createdAt: c.created_at,
      totalMismatch: detectTotalMismatch(c.total, items),
      fullyReversed: detectFullReversal(c.total, items),
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
  /** C-11 guard, carried through from the queue row. `null` when they agree, OR when `fullyReversed` is true. */
  totalMismatch: QueueTotalMismatch | null;
  /** C-16 guard, carried through from the queue row. See `ConsultationQueueRow.fullyReversed`. */
  fullyReversed: boolean;
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
  const items = consultation.items.map((i) => ({ code: i.code, name: i.name, quantity: i.quantity, lineTotal: i.unit_price * i.quantity * (1 + i.tax_rate) - i.discount }));
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
    items,
    totalMismatch: detectTotalMismatch(consultation.total, items),
    fullyReversed: detectFullReversal(consultation.total, items),
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

/**
 * C-11 escape hatch, deliberately explicit and deliberately ugly to write.
 *
 * The guard must NOT block an annulment. A credit note is issued against an
 * invoice the DIAN has already stamped: refusing to build it because the
 * consultation's totals disagree would leave the wrong document legally alive
 * with no way to void it — strictly worse than the problem the guard exists to
 * prevent. So the annul path opts out by name, at its call site, and every
 * other caller gets the guard whether it thought about it or not.
 */
export interface QuickEditPayloadOptions {
  /** Default true. Only the credit-note/annulment path may set this to false. */
  enforceTotalMatch?: boolean;
}

export function buildInvoicePayloadFromQuickEdit(
  consultations: Consultation[], clients: Client[], patients: Patient[],
  id: string, values: QuickEditFormValues, options?: ProvetToSiigoOptions, fallbackDetail?: QuickEditDetail,
  payloadOptions: QuickEditPayloadOptions = {},
): SiigoInvoicePayload | undefined {
  const consultation = consultations.find((c) => c.id === id);
  const client = consultation ? clients.find((c) => c.id === consultation.client_id) : undefined;
  const patient = consultation ? patients.find((p) => p.id === consultation.patient_id) : undefined;

  // C-11. Checked before either branch below, and before anything is built:
  // this is the last point where the two Provet amounts are both still in
  // scope. Whichever source the detail came from — a real consultation or the
  // queue row — a disagreement stops emission here rather than producing a
  // payload that looks perfectly well-formed to Siigo.
  if (payloadOptions.enforceTotalMatch !== false) {
    // C-2, layer 2. Checked before the mismatch so the corrupt row gets its own
    // message: a non-finite line makes the mismatch delta `Infinity`, and
    // "one of the two amounts is wrong" would be a misleading way to say
    // "this line is not a number". Inside the same guard on purpose, so the
    // annulment exemption keeps covering it — a corrupt row must not block
    // reversing an invoice that is already out there.
    const corrupt = (consultation?.items.map((i) => ({ name: i.name, lineTotal: i.unit_price * i.quantity })) ?? fallbackDetail?.items ?? [])
      .find((i) => !Number.isFinite(i.lineTotal));
    if (corrupt) throw new CorruptInvoiceRowError(corrupt.name, corrupt.lineTotal);

    const expectedTotal = consultation ? consultation.total : fallbackDetail?.total;
    const emissionItems = consultation
      ? consultation.items.map((i) => ({ code: i.code, name: i.name, quantity: i.quantity, lineTotal: i.unit_price * i.quantity * (1 + i.tax_rate) - i.discount }))
      : fallbackDetail?.items ?? [];

    // C-16. Checked before the generic mismatch below and named separately:
    // Σ items == 0 against a non-zero header is a consultation billed and
    // then reversed in full, not a disagreement — see ReversedConsultationError.
    if (expectedTotal !== undefined && detectFullReversal(expectedTotal, emissionItems)) {
      throw new ReversedConsultationError(expectedTotal);
    }

    const mismatch = consultation
      ? detectTotalMismatch(consultation.total, emissionItems)
      : fallbackDetail?.totalMismatch ?? null;
    if (mismatch) throw new TotalMismatchError(mismatch);
  }

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