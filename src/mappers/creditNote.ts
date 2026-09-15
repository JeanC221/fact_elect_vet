import { z } from "zod";
import { sanitizedText, hasMaxDecimals, toCents } from "@/schemas/provet";
import {
  siigoDocumentTypeSchema,
  type SiigoInvoicePayload,
} from "@/schemas/siigo";
import { todayInColombia } from "@/mappers/provetToSiigo";

/**
 * DIAN rejection-motive codes for `POST /v1/credit-notes` (Siigo docs,
 * `API_SIIGO_REFERENCIA_COMPLETA.md` §4.1). The two published lists disagree
 * on the edges (the field table lists 1,2,3,4,6,7; the request schema
 * declares 1-6) — unresolved without a live POST using 7, so this app never
 * emits anything outside the range both lists agree on.
 *
 * This app only ever performs a FULL annulment of an already-stamped
 * invoice (never a partial return, discount or price adjustment), so
 * `ANNULMENT_DIAN_REASON` below is the only code this codebase ever sends —
 * see `toCreditNotePayload`.
 */
export const ANNULMENT_DIAN_REASON = 2 as const;

/** DIAN-compliant credit note reason codes for invoice annulment. */
export type AnnulmentReason =
  | "billing_error"
  | "service_cancellation"
  | "duplicate_invoice"
  | "customer_request"
  | "other";

/** Spanish-labeled annulment reasons for the UI select. */
export const ANNULMENT_REASONS: { value: AnnulmentReason; label: string }[] = [
  { value: "billing_error", label: "Error de facturación" },
  { value: "service_cancellation", label: "Cancelación del servicio" },
  { value: "duplicate_invoice", label: "Factura duplicada" },
  { value: "customer_request", label: "Solicitud del cliente" },
  { value: "other", label: "Otro" },
];

/** Spanish label for an internal annulment reason — used to build `observations`. */
function annulmentReasonLabel(reason: AnnulmentReason): string {
  return ANNULMENT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

/**
 * Staff-facing note stored on the Siigo credit note. `reason` is always DIAN
 * code 2 at the wire level (see `ANNULMENT_DIAN_REASON`); the reason the
 * staff actually picked in the UI is preserved here for traceability instead.
 */
export function buildAnnulmentObservations(reason: AnnulmentReason): string {
  return `Motivo: ${annulmentReasonLabel(reason)}`;
}

/** Thrown when the account's Siigo credit-note (NC) document type has not been configured in Ajustes → Mapeo. */
export class MissingCreditNoteSettingError extends Error {
  constructor() {
    super("Falta configurar el tipo de comprobante (Nota Crédito) de Siigo. Vaya a Ajustes → Mapeo de Catálogo y sincronice/seleccione el valor antes de anular.");
    this.name = "MissingCreditNoteSettingError";
  }
}

/** Optional emission overrides for credit notes (mirrors ProvetToSiigoOptions). */
export interface CreditNoteOptions {
  /** Active Siigo credit-note document type id — required, throws MissingCreditNoteSettingError if not configured. */
  documentTypeId?: number;
}

/**
 * Reversal line item. Official Siigo NC contract: `items.price` is positive
 * (`API_SIIGO_REFERENCIA_COMPLETA.md` §4.1 — "Los valores van en positivo");
 * a credit note is a reversal DOCUMENT by nature, not a document of negative
 * amounts. Precision cap is 6 decimals for NC items (the doc states this
 * explicitly for credit notes; the sibling invoice schema caps at 2 only
 * because Siigo's invoice docs say so for invoices — the two are not the
 * same field even though they share a name).
 */
export const siigoCreditNoteItemSchema = z
  .object({
    code: z.string().trim().min(1).max(50),
    description: sanitizedText({ max: 200 }),
    quantity: z.number().positive().max(1e6),
    price: z.number().positive().max(1e9).refine((n) => hasMaxDecimals(n, 6), "Price max 6 decimals").optional(),
    taxed_price: z.number().positive().max(1e9).refine((n) => hasMaxDecimals(n, 6), "Taxed price max 6 decimals").optional(),
    /** Mirrored from the invoice so the reversal cancels the IVA too. */
    taxes: z.array(z.object({ id: z.number().int().positive() })).optional(),
  })
  .refine((i) => (i.price === undefined) !== (i.taxed_price === undefined), {
    message: "Each credit-note item must carry exactly one of price or taxed_price",
    path: ["taxed_price"],
  });

/** Effective unit price of a line, whichever field the invoice used. */
export function unitPriceOf(item: { price?: number; taxed_price?: number }): number {
  return item.taxed_price ?? item.price ?? 0;
}

/** Reversal payment. Positive, like items — see siigoCreditNoteItemSchema's note. Max 2 decimals per doc. */
export const siigoCreditNotePaymentSchema = z.object({
  id: z.number().int().positive(),
  value: z.number().positive().max(1e12).refine((n) => hasMaxDecimals(n, 2), "Value max 2 decimals"),
});

/** Both published lists (field table vs request-schema enum) agree on 1-6. */
export const siigoCreditNoteReasonSchema = z.number().int().min(1).max(6);

/**
 * Siigo POST /v1/credit-notes payload (`API_SIIGO_REFERENCIA_COMPLETA.md`
 * §4.1). No `customer`/`seller` (those are only required via the
 * `invoice_data` path, for a factura that does not exist in Siigo Nube — not
 * this app's flow, since every annulled invoice was just emitted through
 * this same app). No `total` — it is a response-only field, not a request
 * one. Linked to the original invoice by GUID (`invoice`), not by a
 * `base_document` object, which does not exist in Siigo's contract.
 */
export const siigoCreditNoteSchema = z
  .object({
    document: siigoDocumentTypeSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    invoice: z.string().trim().min(1),
    reason: siigoCreditNoteReasonSchema,
    items: z.array(siigoCreditNoteItemSchema).min(1),
    payments: z.array(siigoCreditNotePaymentSchema).min(1),
    observations: z.string().max(500).optional(),
    stamp: z.object({ send: z.boolean().default(false) }),
    mail: z.object({ send: z.boolean().default(false) }),
  })
  .refine(
    (cn) => {
      const itemsTotal = cn.items.reduce((s, i) => s + unitPriceOf(i) * i.quantity, 0);
      const paymentsTotal = cn.payments.reduce((s, p) => s + p.value, 0);
      return toCents(itemsTotal) === toCents(paymentsTotal);
    },
    {
      message: "Credit note items subtotal must match payments total (cent-integer)",
      path: ["payments"],
    },
  );

export type SiigoCreditNotePayload = z.infer<typeof siigoCreditNoteSchema>;

/**
 * Credit-note emission response from Siigo.
 *
 * Mirrors `siigoInvoiceRawResponseSchema`/`siigoInvoiceResponseSchema`
 * deliberately: nobody on this project has ever seen a real populated
 * `stamp` for ANY document type (invoice or credit note) — see
 * `EVIDENCIA_APIS.md` §1.8, "Sigue NO VERIFICADO: la forma real del 201".
 * Requiring `stamp.cufe` here would mean every real credit-note emission
 * throws instead of landing in this app's already-modelled `"Draft"` status
 * (`src/mappers/consultationQueue.ts`'s `InvoiceStatus`), for a shape this
 * app has already decided, for the identical invoice case, is safe to
 * default rather than reject (`.nullish()` costs nothing when the field is
 * genuinely absent; it only becomes dangerous if a real CUFE were silently
 * discarded, which a passthrough zod parse does not do).
 *
 * The `invoice: {id, name}` echo is kept: it is the anchor `findCreditNoteByInvoice`
 * (credit-note reconciliation) matches on.
 */
export const siigoCreditNoteRawResponseSchema = z.object({
  id: z.string().trim().min(1),
  number: z.number().int().optional(),
  name: z.string().trim().max(50).optional(),
  invoice: z.object({ id: z.string().trim().min(1), name: z.string().optional() }).optional(),
  stamp: z.object({
    status: z.string().trim().nullish(),
    cufe: z.string().trim().nullish(),
    cude: z.string().trim().nullish(),
    observations: z.string().nullish(),
    errors: z.string().nullish(),
  }).nullish(),
}).passthrough();

export const siigoCreditNoteResponseSchema = siigoCreditNoteRawResponseSchema.transform((raw) => ({
  ...raw,
  cufe: raw.stamp?.cufe ?? "",
  status: raw.stamp?.status ?? "Draft",
  observations: raw.stamp?.observations ?? undefined,
}));

export type SiigoCreditNoteResponse = z.infer<typeof siigoCreditNoteResponseSchema>;

export function toCreditNotePayload(
  original: SiigoInvoicePayload,
  invoice: { id: string },
  reason: AnnulmentReason,
  options: CreditNoteOptions = {},
): SiigoCreditNotePayload {
  if (options.documentTypeId === undefined) throw new MissingCreditNoteSettingError();
  return {
    document: { id: options.documentTypeId },
    date: todayInColombia(),
    invoice: invoice.id,
    // Always DIAN code 2 ("Anulación de factura electrónica") — this app
    // only ever fully voids an already-stamped invoice. The staff-chosen
    // `reason` is preserved in `observations` instead of the wire `reason`.
    reason: ANNULMENT_DIAN_REASON,
    observations: buildAnnulmentObservations(reason),
    // The credit note must reverse the invoice line-for-line using the SAME
    // price field, now POSITIVE (Siigo's own contract — a credit note is
    // already a reversal document by nature).
    items: original.items.map((i) => ({
      code: i.code,
      description: i.description,
      quantity: i.quantity,
      // The taxes must be mirrored too: a reversal without them would cancel
      // the net amount but leave the IVA standing on the DIAN ledger.
      ...(i.taxes?.length ? { taxes: i.taxes } : {}),
      ...(i.taxed_price !== undefined ? { taxed_price: i.taxed_price } : { price: i.price ?? 0 }),
    })),
    payments: original.payments.map((p) => ({
      id: p.id,
      value: p.value,
    })),
    stamp: { send: true },
    mail: { send: true },
  };
}
