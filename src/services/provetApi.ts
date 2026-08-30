import { z } from "zod";
import {
  provetConsultationRawSchema,
  provetClientRawSchema,
  provetPatientRawSchema,
  provetInvoiceRawSchema,
  provetPaginatedSchema,
  provetPhoneNumberRawSchema,
  provetConsultationItemRawSchema,
} from "@/schemas/provetApi";

/** Custom error class wrapping Provet REST API failures. */
export class ProvetApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ProvetApiError";
  }
}

const BASE = process.env.PROVET_BASE_URL ?? "https://api.provetcloud.com";

async function fetchProvetPage<S extends z.ZodTypeAny>(
  path: string,
  token: string,
  schema: S,
  pageUrl: string | null,
): Promise<{ results: z.infer<S>[]; next: string | null }> {
  const url =
    pageUrl ??
    `${BASE}${path}?access_token=${encodeURIComponent(token)}&page=1&page_size=100&ordering=-modified`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new ProvetApiError(
      "service_unavailable",
      `No se pudo contactar la API de Provet (${path}).`,
    );
  }
  if (!res.ok) {
    throw new ProvetApiError(
      res.status === 401 ? "auth_failed" : "request_failed",
      `Provet ${path} falló (HTTP ${res.status}).`,
    );
  }
  const parsedJson = await res.json();
  console.info(`[DEBUG] fetchProvetPage path="${path}" first result:`, JSON.stringify(parsedJson?.results?.[0]));
  const parsed = provetPaginatedSchema(schema).safeParse(parsedJson);
  if (!parsed.success) {
    throw new ProvetApiError("parse_failed", `Respuesta de Provet ${path} con formato inesperado.`);
  }
  return { results: parsed.data.results, next: parsed.data.next };
}

/** Fetch the first (most-recent) page of each Provet resource. */
async function firstPage<S extends z.ZodTypeAny>(path: string, token: string, schema: S): Promise<z.infer<S>[]> {
  return (await fetchProvetPage(path, token, schema, null)).results;
}

export const fetchConsultations = (token: string) =>
  firstPage("/consultation", token, provetConsultationRawSchema);
export const fetchClients = (token: string) =>
  firstPage("/client", token, provetClientRawSchema);
export const fetchPatients = (token: string) =>
  firstPage("/patient", token, provetPatientRawSchema);
export const fetchInvoices = (token: string) =>
  firstPage("/invoice", token, provetInvoiceRawSchema);
export const fetchPhoneNumbers = (token: string) =>
  firstPage("/phonenumber", token, provetPhoneNumberRawSchema);
export const fetchConsultationItems = (token: string) =>
  firstPage("/consultationitem", token, provetConsultationItemRawSchema);