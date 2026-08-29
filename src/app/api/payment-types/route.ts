import { NextResponse } from "next/server";
import { z } from "zod";
import { siigoPaymentTypeSchema } from "@/schemas/siigo";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { SiigoApiError } from "@/services/siigoApi";
import { mockSiigoPaymentTypes } from "@/mocks/siigo";

export const dynamic = "force-dynamic";

const paymentTypesResponseSchema = z.array(siigoPaymentTypeSchema);

/**
 * GET /api/payment-types — live Siigo payment-type catalog.
 * Authenticates server-side, fetches GET /v1/payment-types, Zod-validates the
 * response, and returns the array. When Siigo credentials are missing
 * (sandbox/dev), falls back to mock data so the UI stays functional.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const { accessToken, partnerId } = await getSiigoAccessToken();
    const baseUrl = process.env.SIIGO_API_BASE_URL ?? "https://api.siigo.com";
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/v1/payment-types`, {
        method: "GET",
        headers: { "Partner-Id": partnerId, Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      return NextResponse.json(mockSiigoPaymentTypes);
    }
    if (!res.ok) throw new SiigoApiError("default", `Siigo payment-types HTTP ${res.status}.`, res.status);
    const parsed = paymentTypesResponseSchema.safeParse(await res.json());
    if (!parsed.success) return NextResponse.json(mockSiigoPaymentTypes);
    return NextResponse.json(parsed.data);
  } catch (err) {
    if (err instanceof SiigoAuthError || err instanceof SiigoApiError) return NextResponse.json(mockSiigoPaymentTypes);
    const message = err instanceof Error ? err.message : "Error al obtener tipos de pago.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 502 });
  }
}
