import { z } from "zod";
import {
  siigoCustomerSchema,
  siigoDocumentTypeSchema,
  type SiigoInvoicePayload,
} from "@/schemas/siigo";

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

/** Reversal line item — price is negated relative to the original invoice. */
/** Mirrors siigoInvoiceItemSchema: exactly one of price / taxed_price, negated. */
export const siigoCreditNoteItemSchema = z
  .object({
    code: z.string().trim().min(1).max(50),
    description: z.string().trim().min(1).max(200),
    quantity: z.number().positive().max(1e6),
    price: z.number().max(1e9).optional(),
    taxed_price: z.number().max(1e9).optional(),
  })
  .refine((i) => (i.price === undefined) !== (i.taxed_price === undefined), {
    message: "Each credit-note item must carry exactly one of price or taxed_price",
    path: ["taxed_price"],
  });

/** Effective unit price of a line, whichever field the invoice used. */
export function unitPriceOf(item: { price?: number; taxed_price?: number }): number {
  return item.taxed_price ?? item.price ?? 0;
}

/** Reversal payment — value is negated relative to the original invoice. */
export const siigoCreditNotePaymentSchema = z.object({
  id: z.number().int().positive(),
  value: z.number().max(1e12),
});

export const siigoCreditNoteReasonSchema = z.enum([
  "billing_error",
  "service_cancellation",
  "duplicate_invoice",
  "customer_request",
  "other",
]);

/** Siigo POST /v1/credit-notes payload (Resolution 948). Total must equal negated items subtotal and payments. */
export const siigoCreditNoteSchema = z
  .object({
    document: siigoDocumentTypeSchema,
    base_document: z.object({
      id: z.string().trim().min(1),
      cufe: z.string().trim().min(1),
    }),
    customer: siigoCustomerSchema,
    items: z.array(siigoCreditNoteItemSchema).min(1),
    payments: z.array(siigoCreditNotePaymentSchema).min(1),
    total: z.number(),
    reason: siigoCreditNoteReasonSchema,
    stamp: z.object({ send: z.boolean().default(false) }),
    mail: z.object({ send: z.boolean().default(false) }),
  })
  .refine(
    (cn) => {
      const itemsTotal = cn.items.reduce((s, i) => s + unitPriceOf(i) * i.quantity, 0);
      const paymentsTotal = cn.payments.reduce((s, p) => s + p.value, 0);
      return itemsTotal === cn.total && paymentsTotal === cn.total;
    },
    {
      message:
        "Credit note total must match negated items subtotal and payments total",
      path: ["total"],
    },
  );

export type SiigoCreditNoteItem = z.infer<typeof siigoCreditNoteItemSchema>;
export type SiigoCreditNotePayment = z.infer<typeof siigoCreditNotePaymentSchema>;
export type SiigoCreditNotePayload = z.infer<typeof siigoCreditNoteSchema>;

/** Credit-note emission response from Siigo (DIAN Accepted). */
export const siigoCreditNoteResponseSchema = z.object({
  id: z.string().trim().min(1),
  cufe: z.string().trim().min(1),
  status: z.literal("Accepted"),
  observations: z.string().optional(),
});

export type SiigoCreditNoteResponse = z.infer<typeof siigoCreditNoteResponseSchema>;

export function toCreditNotePayload(
  original: SiigoInvoicePayload,
  base: { id: string; cufe: string },
  reason: AnnulmentReason,
  options: CreditNoteOptions = {},
): SiigoCreditNotePayload {
  if (options.documentTypeId === undefined) throw new MissingCreditNoteSettingError();
  const itemsTotal = original.items.reduce((s, i) => s + unitPriceOf(i) * i.quantity, 0);
  return {
    document: { id: options.documentTypeId },
    base_document: base,
    customer: original.customer,
    // The credit note must reverse the invoice line-for-line using the SAME
    // price field. Switching fields here would change how Siigo computes the
    // tax on the reversal, leaving a residual balance against the DIAN.
    items: original.items.map((i) => ({
      code: i.code,
      description: i.description,
      quantity: i.quantity,
      ...(i.taxed_price !== undefined
        ? { taxed_price: -i.taxed_price }
        : { price: -(i.price ?? 0) }),
    })),
    payments: original.payments.map((p) => ({
      id: p.id,
      value: -p.value,
    })),
    total: -itemsTotal,
    reason,
    stamp: { send: true },
    mail: { send: true },
  };
}