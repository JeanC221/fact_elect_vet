import { z } from "zod";
import {
  siigoCustomerSchema,
  siigoTaxEnum,
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

/** Reversal line item — price is negated relative to the original invoice. */
export const siigoCreditNoteItemSchema = z.object({
  code: z.string().trim().min(1),
  description: z.string().trim().min(1),
  quantity: z.number().positive(),
  price: z.number(),
  taxes: z.array(z.object({ tax_code: siigoTaxEnum })).min(1),
});

/** Reversal payment — amount is negated relative to the original invoice. */
export const siigoCreditNotePaymentSchema = z.object({
  payment_type_id: z.string().trim().min(1),
  amount: z.number(),
  paid_date: z.coerce.date(),
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
      const itemsTotal = cn.items.reduce((s, i) => s + i.price * i.quantity, 0);
      const paymentsTotal = cn.payments.reduce((s, p) => s + p.amount, 0);
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

/** Pure O(n): transform an accepted invoice into a DIAN-compliant credit note payload. */
export function toCreditNotePayload(
  original: SiigoInvoicePayload,
  base: { id: string; cufe: string },
  reason: AnnulmentReason,
): SiigoCreditNotePayload {
  return {
    base_document: base,
    customer: original.customer,
    items: original.items.map((i) => ({
      code: i.code,
      description: i.description,
      quantity: i.quantity,
      price: -i.price,
      taxes: i.taxes,
    })),
    payments: original.payments.map((p) => ({
      payment_type_id: p.payment_type_id,
      amount: -p.amount,
      paid_date: p.paid_date,
    })),
    total: -original.total,
    reason,
    stamp: { send: false },
    mail: { send: false },
  };
}
