import { z } from "zod";
import { hasMaxDecimals, sanitizedText } from "./provet";

/** DIAN tax classifications (Resolution 948). */
export const siigoTaxEnum = z.enum([
  "IVA_19",
  "IVA_5",
  "EXCLUIDO",
  "EXENTO",
  "INC",
]);

/** Siigo document type discriminator (Factura de Venta, Nota Crédito, ...). */
export const siigoDocumentTypeSchema = z.object({ id: z.number().int().positive() });

export const siigoProductSchema = z.object({
  id: z.string().trim().min(1),
  code: z.string().trim().min(1).max(50),
  name: sanitizedText({ max: 200 }),
  // Accept Siigo's real field, but don't fail parsing when it's absent/differently-shaped.
  tax_classification: z.string().trim().optional(),
  /**
   * Taxes configured on the product in Siigo Nube.
   *
   * Siigo does NOT apply them on its own: an invoice line without an explicit
   * `items.taxes` is stored with zero tax, even when the product is
   * `tax_classification: "Taxed"` with IVA 19%. Verified against the live API —
   * a 19% product billed at 100 came back as total 100.00, no tax line.
   *
   * A Colombian electronic invoice must break the IVA out, so these ids are
   * carried through to the invoice payload. Optional because `Excluded` and
   * `Exempt` products legitimately have none.
   */
  taxes: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string().optional(),
        type: z.string().optional(),
        percentage: z.number().optional(),
      }).passthrough(),
    )
    .optional(),
  unit: z.object({ code: z.string().optional(), name: z.string().optional() }).optional(),
}).passthrough();

export const siigoPaymentTypeSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(50),
  type: z.string().trim().min(1).max(50),
  active: z.boolean().optional().default(true),
  due_date: z.boolean().optional(),
});

export const siigoDocumentTypeCatalogEntrySchema = z.object({
  id: z.number().int().positive(),
  code: z.string().trim().min(1),
  name: sanitizedText(),
  description: z.string().trim().optional(),
  type: z.string().trim().min(1),
  active: z.boolean(),
}).passthrough();

export const siigoSellerSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().trim().min(1).optional(),
  first_name: sanitizedText(),
  last_name: sanitizedText(),
  email: z.string().trim().optional(),
  active: z.boolean(),
  identification: z.string().trim().optional(),
});

/** Phone object shape Siigo expects nested under contacts[].phone (and customer-level phones[]). */
export const siigoPhoneSchema = z.object({
  indicative: z.string().trim().max(5).optional(),
  number: z.string().trim().min(1).max(20),
  extension: z.string().trim().max(10).optional(),
});

/** Siigo customer contact (invoice mail dispatch target when mail.send is true). */
export const siigoContactSchema = z.object({
  first_name: sanitizedText({ max: 100 }),
  last_name: sanitizedText({ max: 100 }),
  email: z.string().trim().max(254).email("Invalid contact email"),
  phone: siigoPhoneSchema.optional(),
});

/** Official Siigo customer (Invoice + Customer - Create): flat identification + branch_office 0. */
export const siigoCustomerSchema = z
  .object({
    person_type: z.enum(["Person", "Company"]),
    id_type: z.string().trim().min(1).max(5),
    identification: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .regex(/^[A-Za-z0-9]+$/, "identification must be alphanumeric"),
    check_digit: z
      .string()
      .trim()
      .regex(/^\d$/, "check_digit must be a single digit")
      .optional(),
    branch_office: z.literal(0),
    name: z
      .array(sanitizedText({ max: 100 }))
      .min(1)
      .max(2),
    contacts: z.array(siigoContactSchema).min(1).optional(),
  })
  .superRefine((customer, ctx) => {
    if (customer.person_type === "Company" && customer.name.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "Company customers must emit a single business-name element",
      });
    }
  });

/**
 * Official Siigo invoice line.
 *
 * `taxed_price` (VAT-inclusive) is sent INSTEAD of `price`, never alongside it.
 * Siigo's docs: "Precio con IVA incluido. Campo opcional. Si se envía,
 * reemplaza items.price."
 *
 * Why: Provet already returns tax-inclusive amounts (`invoicerow.sum_total`),
 * and the clinic's Siigo catalogue carries `tax_included: true` with IVA 5%
 * or 19% configured per product. Putting a VAT-inclusive figure into `price`
 * makes Siigo apply the product's tax ON TOP of tax already included — the
 * invoice comes out 5–19% over.
 *
 * Both are modelled so exactly one is present. Sending both would be the
 * dangerous case: if `taxed_price` were ever ignored, the stale `price` would
 * silently over-charge a legal document instead of failing. Omitting `price`
 * makes that failure loud and immediate.
 */
export const siigoInvoiceItemSchema = z
  .object({
    code: z.string().trim().min(1).max(50),
    description: sanitizedText({ max: 200 }),
    quantity: z.number().positive().max(1e6),
    /**
     * Tax ids from the mapped Siigo product. Sent so the DIAN document breaks
     * the IVA out: combined with `taxed_price`, Siigo derives the taxable base
     * and the tax amount, leaving the total unchanged (verified: taxed_price
     * 119 + IVA 19% -> price 100, tax 19, total 119).
     */
    taxes: z.array(z.object({ id: z.number().int().positive() })).optional(),
    price: z.number().positive().max(1e9).refine((n) => hasMaxDecimals(n, 2), "Price max 2 decimals").optional(),
    /** VAT-inclusive unit price. Siigo derives the base and the tax itself. */
    taxed_price: z.number().positive().max(1e9).refine((n) => hasMaxDecimals(n, 2), "Taxed price max 2 decimals").optional(),
  })
  .refine((i) => (i.price === undefined) !== (i.taxed_price === undefined), {
    message: "Each item must carry exactly one of price or taxed_price, never both and never neither",
    path: ["taxed_price"],
  });

/** Official Siigo invoice payment: numeric payment-type id + COP value. */
export const siigoPaymentSchema = z.object({
  id: z.number().int().positive(),
  value: z.number().positive().max(1e12).refine((n) => hasMaxDecimals(n, 2), "Value max 2 decimals"),
});

/** Official Siigo POST /v1/invoices payload — no `total` key at the root. */
export const siigoInvoicePayloadSchema = z.object({
  document: siigoDocumentTypeSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  customer: siigoCustomerSchema,
  seller: z.number().int().positive(),
  items: z.array(siigoInvoiceItemSchema).min(1),
  payments: z.array(siigoPaymentSchema).min(1),
  /**
   * Free-text note stored on the Siigo document and returned by
   * GET /v1/invoices. Carries the emission marker that makes reconciliation
   * possible after an ambiguous failure — Siigo offers no other way to ask
   * "does a document already exist for this consultation?". Also gives the
   * clinic traceability back to Provet inside their own Siigo Nube.
   */
  observations: z.string().max(500).optional(),
  stamp: z.object({ send: z.boolean().default(false) }),
  mail: z.object({ send: z.boolean().default(false) }),
});

/**
 * Siigo's raw POST /v1/invoices response.
 *
 * OBSERVED (Siigo sandbox, real API call): an unstamped invoice does not send
 * `stamp: null` — it does not send `stamp` AT ALL. The key is simply absent.
 * The root keys that do come back are: balance, cost_center, customer, date,
 * document, id, items, mail, metadata, name, number, observations, payments,
 * prefix, public_url, seller, total.
 *
 * NOT OBSERVED: a populated `stamp` carrying a CUFE. Nobody on this project
 * has seen one. Every sandbox document type is `electronic_type:
 * "NoElectronic"`, so a POST with `stamp.send: true` is refused outright with
 * `{"Code":"document_settings","Message":"The send cannot be used, you must
 * verify the document settings","Params":["stamp.send"]}`. The inner fields
 * below (cufe, cude, status, observations, errors) are modelled from Siigo's
 * DOCUMENTATION, not from a response we have inspected. They stay unverified
 * until the clinic's production credentials and documentTypeId 60345 are
 * available. Treat their exact names and types as a hypothesis.
 *
 * `.nullish()` rather than `.optional()`: `.optional()` would already cover
 * the observed absent-key case, and `.nullable()` alone would NOT. `.nullish()`
 * covers both, which matters because a rejection here is not a harmless
 * validation error — the POST has already succeeded at that point, so
 * `POST /api/invoices` classifies the failure as ambiguous and pins the
 * emission claim to `unknown`, blocking a consultation whose invoice exists.
 * Accepting a null we have never seen costs nothing; rejecting one would cost
 * a wedged consultation.
 *
 * `status` is deliberately NOT an enum: an unrecognised DIAN state must not
 * make the document unparseable. Narrowing happens downstream in
 * `mapSiigoInvoiceStatus`.
 */
export const siigoInvoiceRawResponseSchema = z.object({
  id: z.string().trim().min(1),
  number: z.number().int().optional(),
  name: z.string().trim().max(50).optional(),
  stamp: z.object({
    status: z.string().trim().nullish(),
    cufe: z.string().trim().nullish(),
    cude: z.string().trim().nullish(),
    observations: z.string().nullish(),
    errors: z.string().nullish(),
  }).nullish(),
}).passthrough();

/** Flattened shape this app's UI/history layer consumes (cufe/status/observations at root). */
export const siigoInvoiceResponseSchema = siigoInvoiceRawResponseSchema.transform((raw) => ({
  ...raw,
  cufe: raw.stamp?.cufe ?? "",
  status: raw.stamp?.status ?? "Draft",
  observations: raw.stamp?.observations ?? undefined,
}));

export const siigoErrorSchema = z.object({
  code: z.string().trim().min(1).max(50),
  message: z.string().trim().min(1).max(500),
});

export type SiigoDocumentType = z.infer<typeof siigoDocumentTypeSchema>;
export type SiigoProduct = z.infer<typeof siigoProductSchema>;
export type SiigoPaymentType = z.infer<typeof siigoPaymentTypeSchema>;
export type SiigoDocumentTypeCatalogEntry = z.infer<typeof siigoDocumentTypeCatalogEntrySchema>;
export type SiigoSeller = z.infer<typeof siigoSellerSchema>;
export type SiigoContact = z.infer<typeof siigoContactSchema>;
export type SiigoCustomer = z.infer<typeof siigoCustomerSchema>;
export type SiigoInvoiceItem = z.infer<typeof siigoInvoiceItemSchema>;
export type SiigoPayment = z.infer<typeof siigoPaymentSchema>;
export type SiigoInvoicePayload = z.infer<typeof siigoInvoicePayloadSchema>;
export type SiigoInvoiceResponse = z.infer<typeof siigoInvoiceResponseSchema>;
export type SiigoError = z.infer<typeof siigoErrorSchema>;