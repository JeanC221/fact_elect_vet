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
      NIT: /^\d{7,10}-\d{1}$/,
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

export const clientSchema = z.object({
  id: z.string().trim().min(1),
  identification: identificationSchema,
  name: z.string().trim().min(1, "Client name is required"),
  email: z.string().email("Invalid email address"),
  address: z.string().trim().min(1, "Address is required"),
  phone: z.string().trim().min(7).max(20),
  client_type: z.enum(["natural", "juridical"]),
});

export const patientSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  species: z.string().trim().min(1),
  breed: z.string().trim().min(1).optional(),
  owner_id: z.string().trim().min(1),
});

export const consultationItemSchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().min(1),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  tax_rate: z.number().min(0).max(1),
  discount: z.number().min(0).default(0),
});

export const consultationSchema = z
  .object({
    id: z.string().trim().min(1),
    client_id: z.string().trim().min(1),
    patient_id: z.string().trim().min(1),
    items: z.array(consultationItemSchema).min(1),
    subtotal: z.number().nonnegative(),
    tax_total: z.number().nonnegative(),
    total: z.number().nonnegative(),
    payment_method: z.string().trim().min(1),
    status: z.enum(["pending", "closed"]),
    created_at: z.coerce.date(),
    updated_at: z.coerce.date(),
  })
  .refine((c) => c.subtotal + c.tax_total === c.total, {
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
