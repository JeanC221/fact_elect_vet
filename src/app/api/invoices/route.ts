import { NextResponse } from "next/server";
import { z } from "zod";
import { siigoInvoicePayloadSchema } from "@/schemas/siigo";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { generateIdempotencyKey, SiigoApiError, submitInvoice } from "@/services/siigoApi";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const payload = siigoInvoicePayloadSchema.parse(body);
    // Never log `customer` here — it carries PII (name, email, phone,
    // identification) that would otherwise persist indefinitely in Vercel's
    // function logs. Only non-sensitive fields useful for debugging.
    console.log("[Siigo] POST /v1/invoices", {
      document: payload.document, date: payload.date, seller: payload.seller,
      itemCount: payload.items.length, paymentsTotal: payload.payments.reduce((s, p) => s + p.value, 0),
      stampSend: payload.stamp.send,
    });
    const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? generateIdempotencyKey();
    const { accessToken, partnerId } = await getSiigoAccessToken();
    const response = await submitInvoice(payload, accessToken, partnerId, idempotencyKey);
    console.log("[Siigo] POST /v1/invoices response", { id: response.id, status: response.status, hasCufe: Boolean(response.cufe) });
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
      const detail = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
      console.error("Invoice payload failed Zod validation:", detail);
      return NextResponse.json({ error: { code: "invalid_payload", message: `Payload inválido para Siigo: ${detail}` } }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Error inesperado al emitir la factura.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 500 });
  }
}