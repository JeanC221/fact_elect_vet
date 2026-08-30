import { z } from "zod";

export function provetPaginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    count: z.number().int().nonnegative().catch(0),
    next: z.string().url().nullable().catch(null),
    previous: z.string().url().nullable().catch(null),
    results: z.array(item),
  });
}

const rel = z.coerce.string().trim().min(1);
/** Tolerant text field: numbers → string, null/undefined/missing → "". */
const txt = z.preprocess((v) => (v == null ? "" : String(v)), z.string().trim());

export const provetConsultationRawSchema = z
  .object({
    id: rel,
    client: rel.nullable().catch(null),
    patients: z.array(rel).catch([]),
    consultation_items: z.array(rel).catch([]),
    invoice: rel.nullable().catch(null),
    status: txt,
    started: txt.nullable().catch(null),
    finished: txt.nullable().catch(null),
    ended: txt.nullable().catch(null),
    created: txt,
    modified: txt,
  })
  .passthrough();

export const provetClientRawSchema = z
  .object({
    id: rel,
    url: z.string().nullable().catch(null),
    firstname: txt,
    lastname: txt,
    organization_name: txt,
    customer_type: txt.nullable().catch(null),
    id_number: txt.nullable().catch(null),
    vat_number: txt.nullable().catch(null),
    email: txt.nullable().catch(null),
    street_address: txt.nullable().catch(null),
    city: txt.nullable().catch(null),
    country: z
      .object({ code: z.string().nullable().catch(null), name: z.string().nullable().catch(null) })
      .nullable()
      .catch(null),
  })
  .passthrough();

export const provetPatientRawSchema = z
  .object({
    id: rel,
    url: z.string().nullable().catch(null),
    client: rel.nullable().catch(null),
    name: txt,
    species: txt,
    breed: txt.nullable().catch(null),
  })
  .passthrough();
  
export const provetPhoneNumberRawSchema = z
  .object({
    id: z.coerce.string(),
    client: rel.nullable().catch(null),
    type_code: z.coerce.number().catch(0),
    phone_number: txt,
    is_secondary_owners_phone_number: z.boolean().catch(false),
  })
  .passthrough();

export const provetInvoiceRawSchema = z
  .object({
    id: rel,
    url: z.string().nullable().catch(null),
    status: txt,
    total: z.coerce.number().default(0),
    total_vat: z.coerce.number().default(0),
    total_with_vat: z.coerce.number().default(0),
    consultation: rel.nullable().catch(null),
    client: rel.nullable().catch(null),
    invoice_number: txt.nullable().catch(null),
  })
  .passthrough();

export const provetConsultationItemRawSchema = z
  .object({
    id: rel,
    consultation: rel.nullable().catch(null),
    patient: rel.nullable().catch(null),
    code: txt,
    name: txt,
    quantity: z.coerce.number().default(1),
    price: z.coerce.number().default(0),
    price_with_vat: z.coerce.number().catch(0),
    vat_percentage: z.coerce.number().default(0),
    hide_on_consultation: z.boolean().catch(false),
  })
  .passthrough();

export type ProvetConsultationRaw = z.infer<typeof provetConsultationRawSchema>;
export type ProvetClientRaw = z.infer<typeof provetClientRawSchema>;
export type ProvetPatientRaw = z.infer<typeof provetPatientRawSchema>;
export type ProvetInvoiceRaw = z.infer<typeof provetInvoiceRawSchema>;
export type ProvetConsultationItemRaw = z.infer<typeof provetConsultationItemRawSchema>;
export type ProvetPhoneNumberRaw = z.infer<typeof provetPhoneNumberRawSchema>;
