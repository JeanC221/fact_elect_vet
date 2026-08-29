import { NextResponse } from "next/server";
import { z } from "zod";
import { siigoInvoicePayloadSchema } from "@/schemas/siigo";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { generateIdempotencyKey, SiigoApiError, submitInvoice } from "@/services/siigoApi";

export const dynamic = "force-dynamic";

/**
 * POST /api/invoices — live Siigo invoice emission.
 * Zod-validates the client payload, authenticates server-side, forwards the
 * request with mandatory Partner-Id + Idempotency-Key headers, and returns the
 * Siigo response (including the draft consecutive number) or a structured
 * Spanish error for the UI translation layer.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const payload = siigoInvoicePayloadSchema.parse(body);
    const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? generateIdempotencyKey();
    const { accessToken, partnerId } = await getSiigoAccessToken();
    const response = await submitInvoice(payload, accessToken, partnerId, idempotencyKey);
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof SiigoAuthError) {
      return NextResponse.json(
        { error: { code: err.code, message: "Error de autenticacion con Siigo." } },
        { status: 502 },
      );
    }
    if (err instanceof SiigoApiError) {
      const status = err.status ?? 502;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "invalid_payload", message: "Payload inválido para Siigo." } }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Error inesperado al emitir la factura.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 500 });
  }
}
