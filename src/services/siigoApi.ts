import { z } from "zod";
import { siigoErrorSchema, siigoInvoicePayloadSchema, siigoInvoiceResponseSchema } from "@/schemas/siigo";
import type { SiigoInvoicePayload, SiigoInvoiceResponse } from "@/schemas/siigo";
import {
  siigoCreditNoteResponseSchema, siigoCreditNoteSchema,
  type SiigoCreditNotePayload, type SiigoCreditNoteResponse,
} from "@/mappers/creditNote";

/** Custom error class wrapping Siigo/DIAN error responses. */
export class SiigoApiError extends Error {
  constructor(public code: string, message: string) {
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

/** HTTP status → fallback error code when the body is not a standard Siigo error. */
const STATUS_ERROR_CODES: Record<number, string> = {
  429: "requests_limit",
  503: "service_unavailable",
};

/** Build a SiigoApiError from a failed HTTP response (never exposes raw traces). */
async function toSiigoError(res: Response): Promise<SiigoApiError> {
  const fallback = STATUS_ERROR_CODES[res.status] ?? "default";
  try {
    const parsed = siigoErrorSchema.safeParse(await res.json());
    if (parsed.success) {
      return new SiigoApiError(parsed.data.code, parsed.data.message);
    }
  } catch {
    // Non-JSON error body — fall through to the status-derived code.
  }
  return new SiigoApiError(fallback, `Siigo request failed with HTTP ${res.status}.`);
}

/**
 * Shared live POST against the Siigo Nube API with mandatory headers per spec:
 * `Partner-Id` (3–100 alnum), `Idempotency-Key` (alnum, max 30 — reuse the same
 * key across retries to avoid duplicates), `Authorization` (Bearer token).
 * Body and success response are Zod-validated; network failures surface as
 * `service_unavailable` SiigoApiErrors; HTTP errors via `toSiigoError`.
 */
async function postToSiigo<B, R>(
  path: string, body: B, bodySchema: z.ZodType<B>, responseSchema: z.ZodType<R>,
  accessToken: string, partnerId: string, idempotencyKey: string,
): Promise<R> {
  const validBody = bodySchema.parse(body);
  let res: Response;
  try {
    res = await fetch(`${SIIGO_API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Partner-Id": partnerId,
        "Idempotency-Key": idempotencyKey,
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
 * Submit a Zod-validated credit note to Siigo Nube (live POST /v1/credit-notes),
 * annulling the base invoice before the DIAN (Resolution 948).
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
