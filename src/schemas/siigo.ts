import { z } from "zod";
import { hasMaxDecimals, identificationSchema, sanitizeText, toCents } from "./provet";

/** DIAN tax classifications (Resolution 948). */
export const siigoTaxEnum = z.enum([
  "IVA_19",
  "IVA_5",
  "EXCLUIDO",
  "EXENTO",
  "INC",
]);

export const siigoProductSchema = z.object({
  id: z.string().trim().min(1),
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(100).transform(sanitizeText),
  price: z.number().nonnegative().max(1e9).refine((n) => hasMaxDecimals(n, 6), "Price max 6 decimals"),
  tax_classification: siigoTaxEnum,
  unit_of_measure: z.string().trim().min(1).max(10).default("UND"),
});

export const siigoPaymentTypeSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(50),
  type: z.enum(["cash", "card", "transfer", "credit"]),
});

export const siigoCustomerSchema = z.object({
  identification: identificationSchema,
  name: z
    .array(z.string().trim().min(1).max(100).transform(sanitizeText))
    .min(1)
    .max(2),
  email: z.string().trim().max(254).email().transform((v) => v.toLowerCase()),
  phone: z.string().trim().min(7).max(10),
});

export const siigoInvoiceItemSchema = z.object({
  code: z.string().trim().min(1).max(50),
  description: z.string().trim().min(1).max(200).transform(sanitizeText),
  quantity: z.number().positive().max(1e6),
  price: z.number().nonnegative().max(1e9).refine((n) => hasMaxDecimals(n, 6), "Price max 6 decimals"),
  taxes: z.array(z.object({ tax_code: siigoTaxEnum })).min(1),
});

export const siigoPaymentSchema = z.object({
  payment_type_id: z.string().trim().min(1).max(50),
  amount: z.number().positive().max(1e12).refine((n) => hasMaxDecimals(n, 2), "Amount max 2 decimals"),
  paid_date: z.coerce.date(),
});

export const siigoInvoicePayloadSchema = z
  .object({
    customer: siigoCustomerSchema,
    items: z.array(siigoInvoiceItemSchema).min(1),
    payments: z.array(siigoPaymentSchema).min(1),
    total: z.number().positive().max(1e12).refine((n) => hasMaxDecimals(n, 2), "Total max 2 decimals"),
    stamp: z.object({ send: z.boolean().default(false) }),
    mail: z.object({ send: z.boolean().default(false) }),
  })
  .refine(
    (inv) => {
      const itemsTotal = inv.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );
      const paymentsTotal = inv.payments.reduce((sum, p) => sum + p.amount, 0);
      return toCents(itemsTotal) === toCents(inv.total) && toCents(paymentsTotal) === toCents(inv.total);
    },
    {
      message: "Invoice total must match items subtotal and payments total",
      path: ["total"],
    },
  );

export const siigoInvoiceResponseSchema = z.object({
  id: z.string().trim().min(1),
  number: z.string().trim().max(50).optional(),
  cufe: z.string().trim().min(1),
  status: z.enum(["Accepted", "Draft", "Rejected"]),
  observations: z.string().max(500).optional(),
});

export const siigoErrorSchema = z.object({
  code: z.string().trim().min(1).max(50),
  message: z.string().trim().min(1).max(500),
});

export type SiigoProduct = z.infer<typeof siigoProductSchema>;
export type SiigoPaymentType = z.infer<typeof siigoPaymentTypeSchema>;
export type SiigoCustomer = z.infer<typeof siigoCustomerSchema>;
export type SiigoInvoiceItem = z.infer<typeof siigoInvoiceItemSchema>;
export type SiigoPayment = z.infer<typeof siigoPaymentSchema>;
export type SiigoInvoicePayload = z.infer<typeof siigoInvoicePayloadSchema>;
export type SiigoInvoiceResponse = z.infer<typeof siigoInvoiceResponseSchema>;
export type SiigoError = z.infer<typeof siigoErrorSchema>;
