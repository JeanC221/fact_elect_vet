import { NextResponse } from "next/server";
import { z } from "zod";
import { siigoPaymentTypeSchema } from "@/schemas/siigo";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { SiigoApiError } from "@/services/siigoApi";

export const dynamic = "force-dynamic";

const paymentTypesResponseSchema = z.array(siigoPaymentTypeSchema);

/**
 * GET /api/payment-types — live Siigo payment-type catalog.
 * Authenticates server-side, fetches GET /v1/payment-types, Zod-validates the
 * response, and returns the array. Fails loudly on any error (auth, network,
 * malformed response, non-OK status) instead of silently substituting mock
 * data with a 200 — a silent mock fallback is indistinguishable from the real
 * catalog in the mapping UI, so a staff member mapping a Provet payment
 * method against a mock payment-type id would produce a mapping that only
 * fails later, at real emission time, with a confusing unrelated Siigo error.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { accessToken, partnerId } = await getSiigoAccessToken();
    const baseUrl = process.env.SIIGO_API_BASE_URL ?? "https://api.siigo.com";
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/v1/payment-types?document_type=FV`, {
        method: "GET",
        headers: { "Partner-Id": partnerId, Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new SiigoApiError("service_unavailable", "No se pudo contactar el servicio de formas de pago de Siigo.");
    }
    if (!res.ok) throw new SiigoApiError("default", `Siigo payment-types HTTP ${res.status}.`, res.status);
    const parsed = paymentTypesResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new SiigoApiError("invalid_payload", "La respuesta de formas de pago de Siigo no tiene el formato esperado.");
    return NextResponse.json(parsed.data);
  } catch (err) {
    if (err instanceof SiigoAuthError) {
      return NextResponse.json({ error: { code: err.code, message: "Error de autenticación con Siigo. Verifique las credenciales en Configuración." } }, { status: 502 });
    }
    if (err instanceof SiigoApiError) {
      const status = err.status ?? 502;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    const message = err instanceof Error ? err.message : "Error al obtener tipos de pago.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 502 });
  }
}
