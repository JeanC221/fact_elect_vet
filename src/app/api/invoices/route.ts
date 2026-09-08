import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { siigoInvoicePayloadSchema, type SiigoInvoiceResponse } from "@/schemas/siigo";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { generateIdempotencyKey, SiigoApiError, submitInvoice } from "@/services/siigoApi";
import {
  buildEmissionMarker,
  buildObservations,
  reconcileInvoice,
  AmbiguousReconciliationError,
} from "@/services/invoiceReconciliation";
import {
  acquireInvoiceClaim,
  claimConflictMessage,
  ConsultationAlreadyClaimedError,
  markClaimEmitted,
  markClaimUnknown,
  releaseInvoiceClaim,
} from "@/services/invoiceClaims";
import { requireSession } from "@/services/routeGuard";

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
 * nothing on its own — which is what reconciliation is for.
 */
function provablyCreatedNothing(err: unknown): boolean {
  if (!(err instanceof SiigoApiError)) return false;
  return typeof err.status === "number" && err.status >= 400 && err.status < 500;
}

/**
 * Give Siigo a moment to make a just-created document visible to the list
 * endpoint. Configurable so tests can drop it to 0 and so it can be tuned in
 * production without a code change.
 */
function reconcileDelayMs(): number {
  const configured = Number(process.env.SIIGO_RECONCILE_DELAY_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : 2_000;
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;
  let consultationId: string | null = null;
  let claimHeld = false;
  try {
    const body = await req.json();
    const { consultationId: id, payload } = invoiceRequestSchema.parse(body);
    consultationId = id;

    // One emission attempt = one marker, reused across the internal retry so
    // reconciliation stays stable. The Idempotency-Key, by contrast, must be
    // fresh on the retry: Siigo records a key even when the request fails and
    // rejects its reuse with 400 documents_service (verified against the API).
    const emissionKey = req.headers.get("X-Idempotency-Key") ?? generateIdempotencyKey();
    const marker = buildEmissionMarker(emissionKey);
    const markedPayload = { ...payload, observations: buildObservations(consultationId, emissionKey) };

    // Authenticate BEFORE claiming: an auth failure is unrelated to this
    // consultation and must not leave a claim behind that blocks the retry.
    const { accessToken, partnerId } = await getSiigoAccessToken();

    // Atomic claim. If another device already holds this consultation, we
    // never reach Siigo — the losing request stops here, not after stamping.
    await acquireInvoiceClaim(consultationId, emissionKey);
    claimHeld = true;

    let response: SiigoInvoiceResponse;
    try {
      response = await submitInvoice(markedPayload, accessToken, partnerId, emissionKey);
    } catch (first) {
      if (provablyCreatedNothing(first)) throw first;

      // Ambiguous failure. Measured on the Siigo sandbox, POST /v1/invoices
      // returns HTTP 500 on ~1 request in 10 with an identical payload. Do not
      // guess: ask Siigo whether the document exists.
      await sleep(reconcileDelayMs());
      const existing = await reconcileInvoice(marker, accessToken, partnerId);
      if (existing) {
        // It was created; only the response was lost. Report success.
        await markClaimEmitted(consultationId, existing.id);
        return NextResponse.json(existing);
      }

      // Siigo answered and the document is genuinely absent, so exactly one
      // more attempt is safe. A NEW key is required (see above); the marker
      // stays the same so the second reconciliation still matches.
      try {
        response = await submitInvoice(markedPayload, accessToken, partnerId, generateIdempotencyKey());
      } catch (second) {
        if (provablyCreatedNothing(second)) throw second;
        await sleep(reconcileDelayMs());
        const afterRetry = await reconcileInvoice(marker, accessToken, partnerId);
        if (afterRetry) {
          await markClaimEmitted(consultationId, afterRetry.id);
          return NextResponse.json(afterRetry);
        }
        throw second;
      }
    }

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
        console.error("[claims] no se pudo actualizar el claim de la consulta", consultationId, claimErr);
      }
    }

    if (err instanceof AmbiguousReconciliationError) {
      return NextResponse.json(
        {
          error: {
            code: "ambiguous_reconciliation",
            message:
              "Se encontró más de una factura con la misma marca de emisión para esta consulta. " +
              "Revise en Siigo Nube cuál es la correcta y anule la sobrante con una nota crédito antes de continuar.",
          },
        },
        { status: 409 },
      );
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
