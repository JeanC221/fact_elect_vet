import { z } from "zod";

/** Colombian identification document types (DIAN Resolution 948). */
export const identificationTypes = ["CC", "CE", "NIT", "PA"] as const;

/** Cedula / NIT / foreign ID with per-type format validation. */
export const identificationSchema = z
  .object({
    type: z.enum(identificationTypes),
    number: z.string().trim().min(1).max(30),
  })
  .superRefine(({ type, number }, ctx) => {
    const formats: Record<(typeof identificationTypes)[number], RegExp> = {
      CC: /^\d{6,10}$/,
      NIT: /^(?:\d{8,11}|\d{6,9}-\d{1})$/,
      CE: /^[A-Za-z0-9]{5,20}$/,
      PA: /^[A-Za-z0-9]{5,20}$/,
    };
    if (!formats[type].test(number)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid ${type} identification format`,
        path: ["number"],
      });
    }
  });

/** O(1) cent-integer rounding to defeat float drift in total reconciliations. */
export const toCents = (n: number): number => Math.round(n * 100);

/** True when n has at most `max` decimal places (string-based, float-safe). */
export const hasMaxDecimals = (n: number, max: number): boolean => {
  if (!Number.isFinite(n)) return false;
  const frac = String(n).split(".")[1] ?? "";
  return frac.length <= max;
};

/** Strip single quotes and ASCII control chars (XSS hardening, Siigo ^[^']+$). */
export const sanitizeText = (s: string): string =>
  s.replace(/['\u0000-\u001F]/g, "");

export const clientSchema = z.object({
  id: z.string().trim().min(1),
  identification: identificationSchema,
  name: z.string().trim().min(1, "Client name is required").max(100).transform(sanitizeText),
  email: z.string().trim().max(254).email("Invalid email address"),
  address: z.string().trim().min(1, "Address is required").max(200).transform(sanitizeText),
  phone: z.string().trim().min(7).max(20),
  client_type: z.enum(["natural", "juridical"]),
});

export const patientSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(100).transform(sanitizeText),
  species: z.string().trim().min(1).max(50),
  breed: z.string().trim().min(1).max(50).optional(),
  owner_id: z.string().trim().min(1),
});

export const consultationItemSchema = z.object({
  name: z.string().trim().min(1).max(100).transform(sanitizeText),
  code: z.string().trim().min(1).max(50),
  quantity: z.number().positive().max(1e6),
  unit_price: z.number().nonnegative().max(1e9).refine((n) => hasMaxDecimals(n, 6), "Unit price max 6 decimals"),
  tax_rate: z.number().min(0).max(1),
  discount: z.number().min(0).max(1e9).refine((n) => hasMaxDecimals(n, 6), "Discount max 6 decimals").default(0),
});

export const consultationSchema = z
  .object({
    id: z.string().trim().min(1),
    client_id: z.string().trim().min(1),
    patient_id: z.string().trim().min(1),
    items: z.array(consultationItemSchema).min(1),
    subtotal: z.number().nonnegative().max(1e12).refine((n) => hasMaxDecimals(n, 2), "Subtotal max 2 decimals"),
    tax_total: z.number().nonnegative().max(1e12).refine((n) => hasMaxDecimals(n, 2), "Tax total max 2 decimals"),
    total: z.number().nonnegative().max(1e12).refine((n) => hasMaxDecimals(n, 2), "Total max 2 decimals"),
    payment_method: z.string().trim().min(1).max(50),
    status: z.enum(["pending", "closed"]),
    created_at: z.coerce.date(),
    updated_at: z.coerce.date(),
  })
  .refine((c) => toCents(c.subtotal + c.tax_total) === toCents(c.total), {
    message: "Consultation total must equal subtotal + tax_total",
    path: ["total"],
  });

export const consultationWebhookSchema = z.object({
  event_id: z.literal(45),
  consultation_id: z.string().trim().min(1),
  timestamp: z.coerce.date(),
});

export type Identification = z.infer<typeof identificationSchema>;
export type Client = z.infer<typeof clientSchema>;
export type Patient = z.infer<typeof patientSchema>;
export type ConsultationItem = z.infer<typeof consultationItemSchema>;
export type Consultation = z.infer<typeof consultationSchema>;
export type ConsultationWebhook = z.infer<typeof consultationWebhookSchema>;
