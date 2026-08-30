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
const idempotencyKeyHeaderSchema = z.string().trim().min(1, "Idempotency-Key requerido").max(30, "Idempotency-Key max 30 caracteres").regex(/^[A-Za-z0-9-]+$/, "Idempotency-Key inválido");

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

/**
 * Extracts code + message from Siigo's documented error envelope:
 * `{ Status, Errors: [{ Code, Message, Params, Detail }] }` (PascalCase,
 * plural `Errors`) — the ACTUAL shape per developers.siigo.com/docs, distinct
 * from the lowercase `{code, message}` this app's `siigoErrorSchema` also
 * accepts defensively. Falls back to a plain string or `.message` field.
 */
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

/** Build a SiigoApiError from a failed HTTP response. Always surfaces Siigo's raw code + message when present. */
async function toSiigoError(res: Response): Promise<SiigoApiError> {
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

/**
 * Shared live POST against the Siigo Nube API with mandatory headers per spec:
 * `Partner-Id` (3–100 alnum), `Idempotency-Key` (alnum, max 30 — reuse the same
 * key across retries to avoid duplicates), `Authorization` (Bearer token).
 * Body and success response are Zod-validated; network failures surface as
 * `service_unavailable` SiigoApiErrors; HTTP errors via `toSiigoError`.
 */
async function postToSiigo<B, R>(
  path: string, body: B, bodySchema: z.ZodType<B>, responseSchema: z.ZodType<R, z.ZodTypeDef, unknown>,
  accessToken: string, partnerId: string, idempotencyKey: string,
): Promise<R> {
  const validBody = bodySchema.parse(body);
  const validPartnerId = partnerIdHeaderSchema.parse(partnerId);
  const validIdempotencyKey = idempotencyKeyHeaderSchema.parse(idempotencyKey);
  console.info(`[Siigo] payload validated against official contract before POST ${path}`);
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
    });
  } catch {
    throw new SiigoApiError("service_unavailable", "Network failure while reaching the Siigo API.");
  }
  if (!res.ok) throw await toSiigoError(res);
  return responseSchema.parse(await res.json());
}

/**
 * Submit a Zod-validated invoice payload to Siigo Nube (live POST /v1/invoices).
 * DIAN stamping is governed by the payload's `stamp.send` flag, resolved
 * upstream via `stampSendFor(mode)` — sandbox stays false, production enables it.
 */
export function submitInvoice(
  payload: SiigoInvoicePayload, accessToken: string, partnerId: string,
  idempotencyKey: string = generateIdempotencyKey(),
): Promise<SiigoInvoiceResponse> {
  return postToSiigo("/v1/invoices", payload, siigoInvoicePayloadSchema, siigoInvoiceResponseSchema, accessToken, partnerId, idempotencyKey);
}

/**
 * Submit a Zod-validated credit note (live POST /v1/credit-notes) annulling the
 * base invoice (Resolution 948). V1-aligned: document, base_document, payments.
 */
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

/**
 * Fetch an invoice document (GET /v1/invoices/{id}/{format}). Handles the
 * base64-JSON shape first and falls back to a raw binary body.
 */
async function fetchInvoiceFile(
  invoiceId: string, format: "pdf" | "xml", accessToken: string, partnerId: string,
): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${SIIGO_API_BASE_URL}/v1/invoices/${invoiceId}/${format}`, {
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