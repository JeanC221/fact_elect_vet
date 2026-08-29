import { z } from "zod";
import { hasMaxDecimals, sanitizeText } from "./provet";

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
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(50),
  type: z.enum(["cash", "card", "transfer", "credit"]),
});

/** Official Siigo customer (Invoice + Customer - Create): flat id + numeric branch_office. */
export const siigoCustomerSchema = z.object({
  person_type: z.enum(["Person", "Company"]),
  id_type: z.string().trim().min(1).max(5),
  identification: z.string().trim().min(1).max(30),
  branch_office: z.number().int().nonnegative(),
  name: z
    .array(z.string().trim().min(1).max(100).transform(sanitizeText))
    .min(1)
    .max(2),
});

export const siigoInvoiceItemSchema = z.object({
  code: z.string().trim().min(1).max(50),
  description: z.string().trim().min(1).max(200).transform(sanitizeText),
  quantity: z.number().positive().max(1e6),
  price: z.number().nonnegative().max(1e9).refine((n) => hasMaxDecimals(n, 6), "Price max 6 decimals"),
});

/** Official Siigo invoice payment: numeric payment-type id + COP value. */
export const siigoPaymentSchema = z.object({
  id: z.number().int().positive(),
  value: z.number().positive().max(1e12).refine((n) => hasMaxDecimals(n, 2), "Value max 2 decimals"),
});

/** Official Siigo POST /v1/invoices payload — no `total` key at the root. */
export const siigoInvoicePayloadSchema = z.object({
  document: z.object({ id: z.number().int().positive() }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  customer: siigoCustomerSchema,
  seller: z.number().int().positive(),
  items: z.array(siigoInvoiceItemSchema).min(1),
  payments: z.array(siigoPaymentSchema).min(1),
  stamp: z.object({ send: z.boolean().default(false) }),
  mail: z.object({ send: z.boolean().default(false) }),
});

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