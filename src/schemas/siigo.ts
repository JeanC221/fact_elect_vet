import { z } from "zod";
import { identificationSchema } from "./provet";

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
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  price: z.number().nonnegative(),
  tax_classification: siigoTaxEnum,
  unit_of_measure: z.string().trim().min(1).default("UND"),
});

export const siigoPaymentTypeSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.enum(["cash", "card", "transfer", "credit"]),
});

export const siigoCustomerSchema = z.object({
  identification: identificationSchema,
  name: z.string().trim().min(1),
  email: z.string().email(),
  address: z.string().trim().min(1),
  phone: z.string().trim().min(7).max(20),
});

export const siigoInvoiceItemSchema = z.object({
  code: z.string().trim().min(1),
  description: z.string().trim().min(1),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  taxes: z.array(z.object({ tax_code: siigoTaxEnum })).min(1),
});

export const siigoPaymentSchema = z.object({
  payment_type_id: z.string().trim().min(1),
  amount: z.number().positive(),
  paid_date: z.coerce.date(),
});

export const siigoInvoicePayloadSchema = z
  .object({
    customer: siigoCustomerSchema,
    items: z.array(siigoInvoiceItemSchema).min(1),
    payments: z.array(siigoPaymentSchema).min(1),
    total: z.number().positive(),
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
      return itemsTotal === inv.total && paymentsTotal === inv.total;
    },
    {
      message: "Invoice total must match items subtotal and payments total",
      path: ["total"],
    },
  );

export const siigoInvoiceResponseSchema = z.object({
  id: z.string().trim().min(1),
  cufe: z.string().trim().min(1),
  status: z.enum(["Accepted", "Draft", "Rejected"]),
  observations: z.string().optional(),
});

export const siigoErrorSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
});

export type SiigoProduct = z.infer<typeof siigoProductSchema>;
export type SiigoPaymentType = z.infer<typeof siigoPaymentTypeSchema>;
export type SiigoCustomer = z.infer<typeof siigoCustomerSchema>;
export type SiigoInvoiceItem = z.infer<typeof siigoInvoiceItemSchema>;
export type SiigoPayment = z.infer<typeof siigoPaymentSchema>;
export type SiigoInvoicePayload = z.infer<typeof siigoInvoicePayloadSchema>;
export type SiigoInvoiceResponse = z.infer<typeof siigoInvoiceResponseSchema>;
export type SiigoError = z.infer<typeof siigoErrorSchema>;
