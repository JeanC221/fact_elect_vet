import { z } from "zod";
import {
  siigoProductSchema,
  siigoPaymentTypeSchema,
  type SiigoProduct,
  type SiigoPaymentType,
} from "@/schemas/siigo";
import { SiigoApiError } from "./siigoApi";

/** Base URL for the Siigo Nube API (override via SIIGO_API_BASE_URL env var). */
function siigoBaseUrl(): string {
  return process.env.SIIGO_API_BASE_URL ?? "https://api.siigo.com";
}

/** Build a SiigoApiError from a failed HTTP response (never exposes raw traces). */
async function toSiigoError(res: Response): Promise<SiigoApiError> {
  const fallback = res.status === 429 ? "requests_limit" : res.status === 503 ? "service_unavailable" : "default";
  try {
    const body = await res.json() as { code?: string; message?: string };
    if (body?.code && body?.message) return new SiigoApiError(body.code, body.message, res.status);
  } catch { /* non-JSON body */ }
  return new SiigoApiError(fallback, `Siigo request failed with HTTP ${res.status}.`, res.status);
}

/** Shared GET with Partner-Id + Authorization headers; Zod-validates the response. */
async function getFromSiigo(
  path: string, schema: z.ZodType<unknown>, accessToken: string, partnerId: string,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${siigoBaseUrl()}${path}`, {
      method: "GET",
      headers: {
        "Partner-Id": partnerId,
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new SiigoApiError("service_unavailable", "Network failure while reaching the Siigo API.");
  }
  if (!res.ok) throw await toSiigoError(res);
  return schema.parse(await res.json());
}

/** Fetch active Siigo payment types (GET /v1/payment-types?document_type=FV). */
export async function fetchPaymentTypes(
  accessToken: string, partnerId: string, documentType = "FV",
): Promise<SiigoPaymentType[]> {
  const path = `/v1/payment-types?document_type=${encodeURIComponent(documentType)}`;
  return z.array(siigoPaymentTypeSchema).parse(await getFromSiigo(path, z.array(siigoPaymentTypeSchema), accessToken, partnerId));
}

/** Fetch active Siigo products (GET /v1/products). */
export async function fetchProducts(
  accessToken: string, partnerId: string,
): Promise<SiigoProduct[]> {
  return z.array(siigoProductSchema).parse(await getFromSiigo("/v1/products", z.array(siigoProductSchema), accessToken, partnerId));
}
