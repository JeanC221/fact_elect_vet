import { z } from "zod";
import {
  provetConsultationRawSchema,
  provetClientRawSchema,
  provetPatientRawSchema,
  provetInvoiceRawSchema,
  provetPaginatedSchema,
  provetPhoneNumberRawSchema,
  provetConsultationItemRawSchema,
  provetInvoiceRowRawSchema,
} from "@/schemas/provetApi";

/** Custom error class wrapping Provet REST API failures. */
export class ProvetApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ProvetApiError";
  }
}

function requireBaseUrl(): string {
  const value = process.env.PROVET_BASE_URL;
  if (!value) {
    throw new ProvetApiError(
      "missing_config",
      "Variable de entorno PROVET_BASE_URL no configurada.",
    );
  }
  return value;
}

/** Days of history the queue is scoped to. Exported so the API can report it. */
export function syncWindowDays(): number {
  const raw = process.env.PROVET_SYNC_WINDOW_DAYS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

/** Format a Date as Provet's documented filter format: `YYYY-MM-DD hh:mm+00:00` (UTC). */
function toProvetDateParam(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}+00:00`;
}

function modifiedSinceParam(): string {
  const since = new Date(Date.now() - syncWindowDays() * 24 * 60 * 60 * 1000);
  return toProvetDateParam(since);
}

const MAX_PAGES = 50;
const MAX_429_RETRIES = 4;
const BACKOFF_BASE_MS = 500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers?.get?.("Retry-After") ?? res.headers?.get?.("retry-after");
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  return BACKOFF_BASE_MS * 2 ** attempt;
}

async function fetchProvetPage<S extends z.ZodTypeAny>(
  path: string,
  token: string,
  schema: S,
  pageUrl: string | null,
  windowed: boolean,
  extraQuery = "",
): Promise<{ results: z.infer<S>[]; next: string | null }> {
  const url =
    pageUrl ??
    `${requireBaseUrl()}${path}?page=1&page_size=1000&ordering=-modified` +
      (windowed ? `&modified__gte=${encodeURIComponent(modifiedSinceParam())}` : "") +
      extraQuery;
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new ProvetApiError(
        "service_unavailable",
        `No se pudo contactar la API de Provet (${path}).`,
      );
    }
    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      await sleep(retryDelayMs(res, attempt));
      continue;
    }
    break;
  }
  if (!res.ok) {
    throw new ProvetApiError(
      res.status === 401 ? "auth_failed" : res.status === 429 ? "requests_limit" : "request_failed",
      `Provet ${path} falló (HTTP ${res.status}).`,
    );
  }
  const parsedJson = await res.json();
  const parsed = provetPaginatedSchema(schema).safeParse(parsedJson);
  if (!parsed.success) {
    throw new ProvetApiError("parse_failed", `Respuesta de Provet ${path} con formato inesperado.`);
  }
  return { results: parsed.data.results, next: parsed.data.next };
}

/**
 * Fetch every page of a Provet collection.
 *
 * `windowed` controls the `modified__gte` date filter, and it belongs to
 * exactly ONE resource: `consultation`. That is what the queue is scoped by —
 * "show me recent consultations" is a real requirement.
 *
 * Applying the same filter to the child resources is a silent under-billing
 * bug. A consultation edited yesterday can have invoice lines, a client record
 * or a patient record last modified months earlier. Filtering those by their
 * OWN `modified` date drops them, and the consultation then renders in the
 * queue with an incomplete item list (billed short) or an unresolved client
 * ("Cliente desconocido") — with nothing on screen indicating anything is
 * missing. Measured against the live tenant: a 2000-day window returned 178
 * of 223 invoicerows and 166 of 199 consultationitems.
 *
 * The API offers no usable parent filter (`?consultation=38` on
 * /consultationitem is silently ignored and returns the full set), so children
 * are fetched whole and joined in memory. The MAX_PAGES ceiling below caps
 * that at 50,000 records and throws when exceeded — loudly, rather than
 * returning a truncated set that would look like valid data.
 */
async function firstPage<S extends z.ZodTypeAny>(
  path: string,
  token: string,
  schema: S,
  windowed = false,
  extraQuery = "",
): Promise<z.infer<S>[]> {
  const all: z.infer<S>[] = [];
  let pageUrl: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const { results, next }: { results: z.infer<S>[]; next: string | null } = await fetchProvetPage(
      path,
      token,
      schema,
      pageUrl,
      windowed,
      extraQuery,
    );
    all.push(...results);
    if (!next) return all;
    pageUrl = next;
  }
  throw new ProvetApiError(
    "too_many_pages",
    `Provet ${path} superó ${MAX_PAGES} páginas sin terminar — posible cadena "next" inválida.`,
  );
}

export const fetchConsultations = (token: string) =>
  firstPage("/consultation", token, provetConsultationRawSchema, true);
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
/** Invoice lines — the authoritative billing amounts (see provetInvoiceRowRawSchema). */
export const fetchInvoiceRows = (token: string) =>
  firstPage("/invoicerow", token, provetInvoiceRowRawSchema);

/**
 * C-12 — filtered fetch for the server-side re-derivation of a single
 * consultation's Provet total inside `POST /api/invoices`, so that check
 * cannot be evaded by a client-controlled `expectedTotal`.
 *
 * `consultation__is` is DOCUMENTADO (declared in the OpenAPI schema,
 * `EVIDENCIA_APIS.md` §2.9) but not OBSERVADO — nobody has measured it
 * against a live response, unlike `/invoicerow/?invoice__in=` on the same
 * page. This function does NOT assume the filter narrowed the result: it
 * returns whatever Provet answers verbatim. Correctness depends on the
 * caller (`resolveConsultationInvoiceTotal`) filtering client-side by
 * `consultation` regardless of whether the server-side filter worked — if it
 * is silently ignored (as `consultationitem?consultation=` is), this just
 * costs more bytes on one page (223 invoices today, well under page_size).
 */
export const fetchInvoicesForConsultation = (consultationId: string, token: string) =>
  firstPage(
    "/invoice",
    token,
    provetInvoiceRawSchema,
    false,
    `&consultation__is=${encodeURIComponent(consultationId)}`,
  );