import { NextResponse } from "next/server";
import { z } from "zod";
import { credentialsSchema } from "@/mappers/credentials";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { fetchProducts, fetchPaymentTypes, fetchAllDocumentTypes, fetchSellers } from "@/services/siigoCatalogs";
import { SiigoApiError } from "@/services/siigoApi";

export const dynamic = "force-dynamic";

const syncResponseSchema = z.object({
  paymentTypes: z.array(z.any()),
  products: z.array(z.any()),
  documentTypes: z.array(z.any()),
  sellers: z.array(z.any()),
});

/**
 * POST /api/catalogs/sync — live Siigo catalog fetch.
 * Validates UI credentials, authenticates, then fetches payment types
 * (GET /v1/payment-types?document_type=FV) and products (GET /v1/products)
 * in parallel. Credentials live only in the request body — never persisted.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const creds = credentialsSchema.parse(await req.json());
    const { accessToken, partnerId } = await getSiigoAccessToken({
      username: creds.username, accessKey: creds.accessKey, partnerId: creds.partnerId,
    });
    const [paymentTypes, products, documentTypes, sellers] = await Promise.all([
      fetchPaymentTypes(accessToken, partnerId),
      fetchProducts(accessToken, partnerId),
      fetchAllDocumentTypes(accessToken, partnerId),
      fetchSellers(accessToken, partnerId),
    ]);
    return NextResponse.json(syncResponseSchema.parse({ paymentTypes, products, documentTypes, sellers }));
  } catch (err) {
    //**console.error("SYNC CATCH:", err);
    if (err instanceof SiigoAuthError) {
      return NextResponse.json({ error: { code: err.code, message: "Error de autenticacion con Siigo." } }, { status: 502 });
    }
    if (err instanceof SiigoApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status ?? 502 });
    }
    if (err instanceof z.ZodError) {
      const detail = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
      console.error("Invoice payload failed Zod validation:", detail);
      return NextResponse.json({ error: { code: "invalid_payload", message: `Payload inválido para Siigo: ${detail}` } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: "default", message: "Error inesperado al sincronizar catalogos." } }, { status: 500 });
  }
}