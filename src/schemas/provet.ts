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

/**
 * H-9 — the single source of truth for "what day is it in Colombia right
 * now", used to be reimplemented identically four times (`provetToSiigo.ts`,
 * `consultationQueue.ts`, `invoiceReconciliation.ts`,
 * `creditNoteReconciliation.ts`). Colombia has no DST, so a fixed IANA zone
 * is safe year-round. `Date#toISOString()` returns UTC, which is already the
 * next calendar day in Colombia for roughly 7pm–midnight COT — a DIAN
 * invoice date or a reconciliation window computed from it would silently
 * land on the wrong day.
 */
export const formatColombiaDate = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);

/** True when n has at most `max` decimal places (string-based, float-safe). */
export const hasMaxDecimals = (n: number, max: number): boolean => {
  if (!Number.isFinite(n)) return false;
  const frac = String(n).split(".")[1] ?? "";
  return frac.length <= max;
};

/**
 * Strip single quotes, typographic/smart quotes, unescaped double quotes and
 * ASCII control chars (XSS hardening, Siigo ^[^']+$). Smart quotes are replaced
 * with a clean space to avoid merging adjacent words, then collapsed.
 */
export const sanitizeText = (s: string): string =>
  s
    .replace(/[\u201C\u201D\u201E\u201F\u2018\u2019\u201A\u201B\u00AB\u00BB"'\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A required, sanitised text field.
 *
 * The non-empty check is applied TWICE on purpose: once on the raw input and
 * again on the sanitised output. `sanitizeText` strips quotes and control
 * characters, so an input like `"''"` passes a plain `.min(1)` and comes out
 * as `""` — a schema whose own output its own schema rejects. That broke in
 * two directions:
 *
 *  - re-validating an already-parsed value (a route double-checking what a
 *    service validated) failed on data that had just been accepted;
 *  - an empty description or customer name reached the Siigo payload, i.e. a
 *    blank field on a legal DIAN document, without anything complaining.
 *
 * Using this helper instead of `z.string().trim().min(1).transform(sanitizeText)`
 * makes the field reject at the source and keeps parsing idempotent.
 */
export const sanitizedText = (opts: { max?: number; message?: string } = {}) => {
  const { max, message } = opts;
  const base = z.string().trim().min(1, message);
  const bounded = max === undefined ? base : base.max(max);
  return bounded
    .transform(sanitizeText)
    .pipe(z.string().min(1, message ?? "El texto queda vacío tras eliminar comillas y caracteres de control"));
};

export const clientSchema = z.object({
  id: z.string().trim().min(1),
  identification: identificationSchema,
  name: sanitizedText({ max: 100, message: "Client name is required" }),
  email: z.string().trim().max(254).email("Invalid email address"),
  address: sanitizedText({ max: 200, message: "Address is required" }),
  phone: z.string().trim().min(7).max(20),
  client_type: z.enum(["natural", "juridical"]),
});

export const patientSchema = z.object({
  id: z.string().trim().min(1),
  name: sanitizedText({ max: 100 }),
  species: z.string().trim().min(1).max(50),
  breed: z.string().trim().min(1).max(50).optional(),
  owner_id: z.string().trim().min(1),
});

export const consultationItemSchema = z.object({
  name: sanitizedText({ max: 100 }),
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

export type Identification = z.infer<typeof identificationSchema>;
export type Client = z.infer<typeof clientSchema>;
export type Patient = z.infer<typeof patientSchema>;
export type Consultation = z.infer<typeof consultationSchema>;
