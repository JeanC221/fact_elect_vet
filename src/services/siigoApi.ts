import { z } from "zod";
import { siigoErrorSchema, siigoInvoicePayloadSchema, siigoInvoiceResponseSchema } from "@/schemas/siigo";
import type { SiigoInvoicePayload, SiigoInvoiceResponse } from "@/schemas/siigo";
import {
  siigoCreditNoteResponseSchema, siigoCreditNoteSchema,
  type SiigoCreditNotePayload, type SiigoCreditNoteResponse,
} from "@/mappers/creditNote";

/** Custom error class wrapping Siigo/DIAN error responses. */
export class SiigoApiError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
    this.name = "SiigoApiError";
  }
}

/** Base URL for the Siigo Nube API (override via SIIGO_API_BASE_URL env var). */
export const SIIGO_API_BASE_URL = process.env.SIIGO_API_BASE_URL ?? "https://api.siigo.com";

/** Unique idempotency key (alphanumeric, max 30 chars) — prevents duplicate documents per Siigo spec. */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 30);
}

/** Runtime validation for mandatory Siigo headers (defense-in-depth for non-UI callers). */
const partnerIdHeaderSchema = z.string().trim().min(3, "Partner-Id requiere 3-100 caracteres").max(100).regex(/^[A-Za-z0-9-]+$/, "Partner-Id inválido");
/**
 * Strictly alphanumeric. Siigo's Idempotencia page requires "alfanumérico, sin
 * caracteres especiales, sin espacios en blanco, máximo 30 caracteres", and the
 * `invalid_idempotency-key` error repeats "sin caracteres especiales" (while
 * stating 32 — the docs contradict each other on length, so 30 is kept as the
 * conservative bound). A hyphen is a special character under both readings.
 *
 * This matters because the key is not always generated here: `POST /api/invoices`
 * and `POST /api/credit-notes` accept a client-supplied `X-Idempotency-Key`
 * header. Rejecting it locally costs nothing; letting it reach Siigo burns the
 * key, and a Siigo 5xx consumes it permanently.
 */
const idempotencyKeyHeaderSchema = z.string().trim().min(1, "Idempotency-Key requerido").max(30, "Idempotency-Key max 30 caracteres").regex(/^[A-Za-z0-9]+$/, "Idempotency-Key inválido: solo caracteres alfanuméricos, sin guiones ni espacios.");

/** HTTP status → fallback error code when the body is not a standard Siigo error. */
const STATUS_ERROR_CODES: Record<number, string> = {
  429: "requests_limit",
  503: "service_unavailable",
};

/** Extracted error info from Siigo's alternate error shapes (Errors[] array, plain string). */
interface ExtractedSiigoError {
  code: string | null;
  message: string;
}

function extractSiigoError(body: unknown): ExtractedSiigoError | null {
  if (typeof body === "string" && body.trim().length > 0) return { code: null, message: body.trim() };
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.Errors) && obj.Errors.length > 0) {
      const first = obj.Errors[0];
      const firstCode = first && typeof first === "object" ? (first as Record<string, unknown>).Code : undefined;
      const message = obj.Errors.map((e) => {
        if (e && typeof e === "object") {
          const err = e as Record<string, unknown>;
          return [err.Code, err.Message].filter(Boolean).join(": ");
        }
        return String(e);
      }).join(" | ");
      return { code: typeof firstCode === "string" ? firstCode : null, message };
    }
    if (typeof obj.message === "string") return { code: null, message: obj.message };
  }
  return null;
}

/**
 * Build a SiigoApiError from a failed HTTP response. Always surfaces Siigo's
 * raw code + message when present. Tries the legacy flat {code,message}
 * shape first (some Siigo endpoints and most of this file's tests use it),
 * then falls back to Siigo's documented real error envelope
 * {Status, Errors:[{Code,Message}]}. Exported so siigoCatalogs.ts (and any
 * other caller hitting Siigo directly) shares one error-parsing
 * implementation instead of a second one that only understands the flat shape.
 */
export async function toSiigoError(res: Response): Promise<SiigoApiError> {
  const fallback = STATUS_ERROR_CODES[res.status] ?? "default";
  let rawBody: unknown;
  try {
    rawBody = await res.json();
  } catch {
    return new SiigoApiError(fallback, `Siigo request failed with HTTP ${res.status}.`, res.status);
  }
  const parsed = siigoErrorSchema.safeParse(rawBody);
  if (parsed.success) {
    return new SiigoApiError(parsed.data.code, parsed.data.message, res.status);
  }
  const extracted = extractSiigoError(rawBody);
  if (extracted) {
    return new SiigoApiError(extracted.code ?? fallback, extracted.message, res.status);
  }
  return new SiigoApiError(
    fallback,
    `Siigo request failed with HTTP ${res.status}. Body: ${JSON.stringify(rawBody).slice(0, 300)}`,
    res.status,
  );
}

const SIIGO_POST_TIMEOUT_MS = 120_000;

async function postToSiigo<B, R>(
  path: string, body: B, bodySchema: z.ZodType<B>, responseSchema: z.ZodType<R, z.ZodTypeDef, unknown>,
  accessToken: string, partnerId: string, idempotencyKey: string,
): Promise<R> {
  const validBody = bodySchema.parse(body);
  const validPartnerId = partnerIdHeaderSchema.parse(partnerId);
  const validIdempotencyKey = idempotencyKeyHeaderSchema.parse(idempotencyKey);
  console.info(`[Siigo] payload validated against official contract before POST ${path}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIIGO_POST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${SIIGO_API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Partner-Id": validPartnerId,
        "Idempotency-Key": validIdempotencyKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(validBody),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new SiigoApiError(
        "request_timeout",
        `Siigo no respondió en ${SIIGO_POST_TIMEOUT_MS / 1000}s. La factura puede haberse creado igualmente — revise el historial antes de reintentar.`,
      );
    }
    throw new SiigoApiError("service_unavailable", "Network failure while reaching the Siigo API.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw await toSiigoError(res);
  return responseSchema.parse(await res.json());
}

export function submitInvoice(
  payload: SiigoInvoicePayload, accessToken: string, partnerId: string,
  idempotencyKey: string = generateIdempotencyKey(),
): Promise<SiigoInvoiceResponse> {
  return postToSiigo("/v1/invoices", payload, siigoInvoicePayloadSchema, siigoInvoiceResponseSchema, accessToken, partnerId, idempotencyKey);
}

export function submitCreditNote(
  payload: SiigoCreditNotePayload, accessToken: string, partnerId: string,
  idempotencyKey: string = generateIdempotencyKey(),
): Promise<SiigoCreditNoteResponse> {
  return postToSiigo("/v1/credit-notes", payload, siigoCreditNoteSchema, siigoCreditNoteResponseSchema, accessToken, partnerId, idempotencyKey);
}

/** Siigo file-download shape: base64-encoded document. */
const siigoFileResponseSchema = z.object({ id: z.string().trim().min(1), base64: z.string().min(1) });

/** Decode a base64 payload into a Blob. */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

async function fetchInvoiceFile(
  invoiceId: string, format: "pdf" | "xml", accessToken: string, partnerId: string,
): Promise<Blob> {
  let res: Response;
  try {
    // Percent-encode the id even though callers are expected to validate it
    // first (see the route handler's invoiceIdSchema). This is the actual URL
    // sink, and it is reachable from any future caller: a raw `/` or `?` here
    // would silently retarget the request at a different Siigo resource. For
    // a well-formed id this encoding is a no-op.
    res = await fetch(`${SIIGO_API_BASE_URL}/v1/invoices/${encodeURIComponent(invoiceId)}/${format}`, {
      method: "GET",
      headers: { "Partner-Id": partnerId, Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new SiigoApiError("service_unavailable", "Network failure while reaching the Siigo API.");
  }
  if (!res.ok) throw await toSiigoError(res);
  try {
    const parsed = siigoFileResponseSchema.safeParse(await res.clone().json());
    if (parsed.success) return base64ToBlob(parsed.data.base64, format === "pdf" ? "application/pdf" : "application/xml");
  } catch {
    // Non-JSON body — fall through to the raw binary branch.
  }
  return res.blob();
}

/** Download the DIAN-stamped PDF representation of an invoice. */
export function fetchInvoicePdf(invoiceId: string, accessToken: string, partnerId: string): Promise<Blob> {
  return fetchInvoiceFile(invoiceId, "pdf", accessToken, partnerId);
}

/** Download the DIAN XML (UBL) representation of an invoice. */
export function fetchInvoiceXml(invoiceId: string, accessToken: string, partnerId: string): Promise<Blob> {
  return fetchInvoiceFile(invoiceId, "xml", accessToken, partnerId);
}