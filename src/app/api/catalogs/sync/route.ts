import { NextResponse } from "next/server";
import { z } from "zod";
import { credentialsSchema } from "@/mappers/credentials";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { fetchProducts, fetchPaymentTypes, fetchAllDocumentTypes, fetchSellers } from "@/services/siigoCatalogs";
import { SiigoApiError } from "@/services/siigoApi";
import {
  siigoProductSchema,
  siigoPaymentTypeSchema,
  siigoDocumentTypeCatalogEntrySchema,
  siigoSellerSchema,
} from "@/schemas/siigo";

export const dynamic = "force-dynamic";

/**
 * Honest contract for what this route actually returns.
 *
 * These are the same schemas `siigoCatalogs.ts` already applies to each Siigo
 * response, so this parse is a second, cheap assertion rather than the primary
 * defence. It is stated explicitly because the previous `z.array(z.any())`
 * validated nothing while looking like it did — a reader auditing this route
 * would have concluded the payload was checked here when it was not.
 */
const syncResponseSchema = z.object({
  paymentTypes: z.array(siigoPaymentTypeSchema),
  products: z.array(siigoProductSchema),
  documentTypes: z.array(siigoDocumentTypeCatalogEntrySchema),
  sellers: z.array(siigoSellerSchema),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const rawBody = await req.json().catch(() => ({}));
    const hasBodyCreds = rawBody && typeof rawBody === "object" && Object.keys(rawBody).length > 0;
    const creds = hasBodyCreds ? credentialsSchema.parse(rawBody) : undefined;
    const { accessToken, partnerId } = await getSiigoAccessToken(
      creds ? { username: creds.username, accessKey: creds.accessKey, partnerId: creds.partnerId } : undefined,
    );
    const [paymentTypes, products, documentTypes, sellers] = await Promise.all([
      fetchPaymentTypes(accessToken, partnerId),
      fetchProducts(accessToken, partnerId),
      fetchAllDocumentTypes(accessToken, partnerId),
      fetchSellers(accessToken, partnerId),
    ]);
    const validated = syncResponseSchema.safeParse({ paymentTypes, products, documentTypes, sellers });
    if (!validated.success) {
      // safeParse, not parse: a ZodError thrown here would fall into the
      // catch block below and surface as 400 "payload inválido", blaming the
      // caller for a malformed CATALOGUE. The caller sent valid credentials;
      // it is Siigo's response that is wrong, so this is an upstream failure.
      const detail = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
      console.error("Siigo catalog response failed Zod validation:", detail);
      return NextResponse.json(
        {
          error: {
            code: "invalid_payload",
            message: "Siigo devolvió un catálogo con un formato inesperado. No se sincronizó nada.",
          },
        },
        { status: 502 },
      );
    }
    return NextResponse.json(validated.data);
  } catch (err) {
    if (err instanceof SiigoAuthError) {
      return NextResponse.json({ error: { code: err.code, message: "Error de autenticacion con Siigo." } }, { status: 502 });
    }
    if (err instanceof SiigoApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status ?? 502 });
    }
    if (err instanceof z.ZodError) {
      const detail = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
      // Reaching here means the CREDENTIALS body failed validation — the only
      // remaining Zod source in this handler now that the catalogue response
      // is checked with safeParse above. 400 is correct: the caller sent it.
      console.error("Sync credentials failed Zod validation:", detail);
      return NextResponse.json({ error: { code: "invalid_payload", message: `Credenciales inválidas: ${detail}` } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: "default", message: "Error inesperado al sincronizar catalogos." } }, { status: 500 });
  }
}