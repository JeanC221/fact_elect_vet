import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { siigoCreditNoteSchema } from "@/mappers/creditNote";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { generateIdempotencyKey, SiigoApiError, submitCreditNote } from "@/services/siigoApi";
import { reconcileCreditNote } from "@/services/creditNoteReconciliation";
import { AmbiguousReconciliationError, ReconciliationTruncatedError } from "@/services/invoiceReconciliation";
import {
  acquireAnnulmentClaim,
  annulmentConflictMessage,
  AnnulmentNotAllowedError,
  markClaimAnnulled,
  releaseAnnulmentClaim,
} from "@/services/invoiceClaims";
import { requireSession } from "@/services/routeGuard";

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

/**
 * Whether Siigo's response PROVES no credit note was created — same
 * reasoning as `invoices/route.ts`'s `provablyCreatedNothing`. Only a 4xx
 * that is not itself evidence of a prior document tells us that.
 */
function provablyCreatedNothing(err: unknown): boolean {
  if (!(err instanceof SiigoApiError)) return false;
  if (err.code === "duplicated_document" || err.code === "already_exists") return false;
  return typeof err.status === "number" && err.status >= 400 && err.status < 500;
}

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
  // Set once the claim's fate (release / mark-annulled / deliberately left
  // as `annulling`) has already been decided inside the try block below, so
  // the generic outer cleanup never re-derives it from the WRONG error (e.g.
  // a 401 thrown by the reconciliation lookup itself must never be read as
  // "Siigo proved the credit note was not created").
  let claimResolved = false;
  try {
    const body = await req.json();
    const { consultationId: id, payload } = creditNoteRequestSchema.parse(body);
    consultationId = id;
    const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? generateIdempotencyKey();
    const { accessToken, partnerId } = await getSiigoAccessToken();

    // Atomic claim. If another device is already annulling this same
    // consultation, we never reach Siigo — the losing request stops here.
    await acquireAnnulmentClaim(consultationId);
    claimHeld = true;

    let response;
    try {
      response = await submitCreditNote(payload, accessToken, partnerId, idempotencyKey);
    } catch (first) {
      if (provablyCreatedNothing(first)) throw first;

      // Ambiguous failure (timeout/5xx/unparseable response). Do not guess —
      // ask Siigo whether a credit note against this invoice already exists.
      await sleep(reconcileDelayMs());
      let existing;
      try {
        existing = await reconcileCreditNote(payload.invoice, accessToken, partnerId);
      } catch (reconcileErr) {
        // The CHECK itself failed — genuinely unresolved, not proof of
        // anything. Leave the claim `annulling`, surfaced via the admin panel.
        claimResolved = true;
        throw reconcileErr;
      }
      if (existing) {
        await markClaimAnnulled(consultationId, existing.id);
        claimResolved = true;
        return NextResponse.json(existing);
      }
      // Siigo answered and confirmed the credit note genuinely does not
      // exist: safe to free the consultation for a clean retry.
      await releaseAnnulmentClaim(consultationId);
      claimResolved = true;
      throw first;
    }

    try {
      await markClaimAnnulled(consultationId, response.id);
    } catch (claimErr) {
      // The credit note IS stamped; failing here must not report failure to
      // the user. The consultation simply stays `annulling` until an admin
      // releases it — the safe direction, and loudly logged.
      console.error("[claims] nota crédito emitida pero el claim no se marcó como anulado:", consultationId, claimErr);
    }
    claimResolved = true;
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof AnnulmentNotAllowedError) {
      return NextResponse.json(
        { error: { code: "annulment_not_allowed", message: annulmentConflictMessage(err.claim) } },
        { status: 409 },
      );
    }

    if (claimHeld && consultationId && !claimResolved) {
      try {
        if (provablyCreatedNothing(err)) {
          await releaseAnnulmentClaim(consultationId);
        }
        // Any other error reaching here is unresolved by construction (the
        // inner try/catch above already resolves every case it can reason
        // about). Leave the claim `annulling` rather than guess.
      } catch (claimErr) {
        console.error("[claims] no se pudo actualizar el claim de anulación", consultationId, claimErr);
      }
    }

    if (err instanceof AmbiguousReconciliationError) {
      return NextResponse.json(
        {
          error: {
            code: "ambiguous_reconciliation",
            message:
              "Se encontró más de una nota crédito para la misma factura. Revise en Siigo Nube cuál es la correcta antes de continuar.",
          },
        },
        { status: 409 },
      );
    }
    if (err instanceof ReconciliationTruncatedError) {
      return NextResponse.json(
        { error: { code: "reconciliation_truncated", message: err.message } },
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
      console.error("Credit note payload failed Zod validation:", detail);
      return NextResponse.json({ error: { code: "invalid_payload", message: `Payload inválido para Siigo: ${detail}` } }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Error inesperado al generar la nota crédito.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 500 });
  }
}
