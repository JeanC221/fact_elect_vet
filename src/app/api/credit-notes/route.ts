import { NextResponse } from "next/server";
import { z } from "zod";
import { siigoCreditNoteSchema } from "@/mappers/creditNote";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { generateIdempotencyKey, SiigoApiError, submitCreditNote } from "@/services/siigoApi";
import { markClaimAnnulled } from "@/services/invoiceClaims";

export const dynamic = "force-dynamic";

/**
 * `consultationId` is mandatory so the emission claim can be marked annulled
 * once the credit note is accepted. Without it the consultation would stay
 * blocked forever after being voided — and re-billing a voided invoice is the
 * whole point of issuing a credit note.
 */
const creditNoteRequestSchema = z.object({
  consultationId: z.string().trim().min(1).max(100),
  payload: siigoCreditNoteSchema,
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { consultationId, payload } = creditNoteRequestSchema.parse(body);
    const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? generateIdempotencyKey();
    const { accessToken, partnerId } = await getSiigoAccessToken();
    const response = await submitCreditNote(payload, accessToken, partnerId, idempotencyKey);
    try {
      await markClaimAnnulled(consultationId, response.id);
    } catch (claimErr) {
      // The credit note IS stamped; failing here must not report failure to
      // the user. The consultation simply stays blocked until an admin
      // releases it — the safe direction, and loudly logged.
      console.error("[claims] nota crédito emitida pero el claim no se marcó como anulado:", consultationId, claimErr);
    }
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
      console.error("Credit note payload failed Zod validation:", detail);
      return NextResponse.json({ error: { code: "invalid_payload", message: `Payload inválido para Siigo: ${detail}` } }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Error inesperado al generar la nota crédito.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 500 });
  }
}