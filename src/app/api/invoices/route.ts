import { NextResponse } from "next/server";
import { z } from "zod";
import { siigoInvoicePayloadSchema } from "@/schemas/siigo";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { generateIdempotencyKey, SiigoApiError, submitInvoice } from "@/services/siigoApi";
import {
  acquireInvoiceClaim,
  claimConflictMessage,
  ConsultationAlreadyClaimedError,
  markClaimEmitted,
  markClaimUnknown,
  releaseInvoiceClaim,
} from "@/services/invoiceClaims";

export const dynamic = "force-dynamic";

/**
 * Emission request. `consultationId` is mandatory: without it the server
 * cannot tell whether this consultation has already been stamped at the DIAN,
 * which is the whole point of the claim below. A bare Siigo payload (the old
 * request shape) is rejected with 400 rather than silently emitted unlinked.
 */
const invoiceRequestSchema = z.object({
  consultationId: z.string().trim().min(1).max(100),
  payload: siigoInvoicePayloadSchema,
});

/**
 * Can we prove Siigo created nothing?
 *
 * Only a 4xx tells us that: the request was refused at validation time, before
 * any document was written. A timeout, a dropped socket or a 5xx tells us
 * nothing — the invoice may well have been stamped and the response lost on
 * the way back. Releasing the claim in those cases is precisely how a
 * duplicate DIAN document gets created on the retry, so they keep the claim
 * and force a human to check Siigo Nube first.
 */
function provablyCreatedNothing(err: unknown): boolean {
  if (!(err instanceof SiigoApiError)) return false;
  return typeof err.status === "number" && err.status >= 400 && err.status < 500;
}

export async function POST(req: Request): Promise<NextResponse> {
  let consultationId: string | null = null;
  let claimHeld = false;
  try {
    const body = await req.json();
    const { consultationId: id, payload } = invoiceRequestSchema.parse(body);
    consultationId = id;

    const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? generateIdempotencyKey();

    // Authenticate BEFORE claiming: an auth failure is unrelated to this
    // consultation and must not leave a claim behind that blocks the retry.
    const { accessToken, partnerId } = await getSiigoAccessToken();

    // Atomic claim. If another device already holds this consultation, we
    // never reach Siigo — the losing request stops here, not after stamping.
    await acquireInvoiceClaim(consultationId, idempotencyKey);
    claimHeld = true;

    const response = await submitInvoice(payload, accessToken, partnerId, idempotencyKey);
    await markClaimEmitted(consultationId, response.id);
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof ConsultationAlreadyClaimedError) {
      return NextResponse.json(
        { error: { code: "consultation_already_claimed", message: claimConflictMessage(err.claim) } },
        { status: 409 },
      );
    }

    if (claimHeld && consultationId) {
      const reason = err instanceof Error ? err.message : String(err);
      try {
        if (provablyCreatedNothing(err)) {
          await releaseInvoiceClaim(consultationId);
        } else {
          await markClaimUnknown(consultationId, reason);
        }
      } catch (claimErr) {
        // Never let claim bookkeeping mask the original Siigo error.
        console.error("[claims] no se pudo actualizar el claim de la consulta", consultationId, claimErr);
      }
    }

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
      console.error("Invoice request failed Zod validation:", detail);
      return NextResponse.json({ error: { code: "invalid_payload", message: `Payload inválido para Siigo: ${detail}` } }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Error inesperado al emitir la factura.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 500 });
  }
}
