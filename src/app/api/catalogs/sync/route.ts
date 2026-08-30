import { NextResponse } from "next/server";
import { z } from "zod";
import { credentialsSchema } from "@/mappers/credentials";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { fetchProducts, fetchPaymentTypes } from "@/services/siigoCatalogs";
import { SiigoApiError } from "@/services/siigoApi";

export const dynamic = "force-dynamic";

const syncResponseSchema = z.object({
  paymentTypes: z.array(z.any()),
  products: z.array(z.any()),
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
    const [paymentTypes, products] = await Promise.all([
      fetchPaymentTypes(accessToken, partnerId),
      fetchProducts(accessToken, partnerId),
    ]);
    return NextResponse.json(syncResponseSchema.parse({ paymentTypes, products }));
  } catch (err) {
    //**console.error("SYNC CATCH:", err);
    if (err instanceof SiigoAuthError) {
      return NextResponse.json({ error: { code: err.code, message: "Error de autenticacion con Siigo." } }, { status: 502 });
    }
    if (err instanceof SiigoApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status ?? 502 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "invalid_credentials", message: "Formato de credenciales invalido." } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: "default", message: "Error inesperado al sincronizar catalogos." } }, { status: 500 });
  }
}
