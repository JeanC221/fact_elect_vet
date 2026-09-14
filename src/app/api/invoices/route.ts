import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { siigoInvoicePayloadSchema, type SiigoInvoiceResponse } from "@/schemas/siigo";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { generateIdempotencyKey, idempotencyKeyHeaderSchema, SiigoApiError, submitInvoice } from "@/services/siigoApi";
import {
  buildEmissionMarker,
  buildObservations,
  reconcileInvoice,
  AmbiguousReconciliationError,
  ReconciliationTruncatedError,
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
import { toCents } from "@/schemas/provet";

export const dynamic = "force-dynamic";

/**
 * Emission request. `consultationId` is mandatory: without it the server
 * cannot tell whether this consultation has already been stamped at the DIAN,
 * which is the whole point of the claim below. A bare Siigo payload (the old
 * request shape) is rejected with 400 rather than silently emitted unlinked.
 */
const invoiceRequestSchema = z.object({
  consultationId: z.string().trim().min(1).max(100),
  /**
   * C-11 / decision D — Provet's invoice header total (`total_with_vat`) for
   * this consultation, sent alongside the payload so the server can check the
   * two independent amounts against each other without a Provet round-trip.
   *
   * Required, not optional: an optional field would let a caller skip the
   * check by omission, which is the silent fallback this whole guard exists to
   * remove.
   *
   * This does NOT make the route safe against a malicious client — a crafted
   * request can send an `expectedTotal` that agrees with a wrong `items`. The
   * threat model here is bugs, not malice, and against a bug it works,
   * because the two numbers come from different places: the Provet header and
   * the already-filtered rows. The non-evadable version is C-12, session 4.
   */
  expectedTotal: z.number().finite().max(1e12),
  payload: siigoInvoicePayloadSchema,
});

/** Thrown before the claim is taken — see the call site for why the order matters. */
class EmissionTotalMismatchError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "EmissionTotalMismatchError";
  }
}

/**
 * Sum the payload the way Siigo will: quantity x VAT-inclusive unit price.
 *
 * `taxed_price` is required on every line here. The mapper only ever emits
 * `taxed_price` (siigoInvoiceItemSchema allows `price` as the exclusive-VAT
 * alternative), and a payload built with `price` is not comparable against a
 * VAT-inclusive Provet header at all — so that case is refused rather than
 * compared wrongly.
 */
function assertPayloadMatchesProvetTotal(
  payload: z.infer<typeof siigoInvoicePayloadSchema>,
  expectedTotal: number,
): void {
  const untaxed = payload.items.filter((i) => i.taxed_price === undefined);
  if (untaxed.length > 0) {
    throw new EmissionTotalMismatchError(
      "El payload trae líneas con `price` en vez de `taxed_price`, que no son comparables con el total de Provet. No se emite.",
    );
  }
  const itemsTotal = payload.items.reduce((sum, i) => sum + i.quantity * (i.taxed_price ?? 0), 0);
  if (toCents(itemsTotal) === toCents(expectedTotal)) return;
  const fmt = (n: number) => n.toFixed(2);
  throw new EmissionTotalMismatchError(
    `El total de Provet para esta consulta (${fmt(expectedTotal)}) no coincide con la suma de las líneas del ` +
      `documento (${fmt(itemsTotal)}); diferencia de ${fmt((toCents(itemsTotal) - toCents(expectedTotal)) / 100)}. ` +
      `No se emite: uno de los dos importes es incorrecto y no hay forma de saber cuál. Revise la factura en Provet Cloud.`,
  );
}

/**
 * Whether Siigo's response PROVES nothing was created.
 *
 * Only a 4xx tells us that: the request was refused at validation time, before
 * any document was written. A timeout, a dropped socket or a 5xx tells us
 * nothing on its own — which is what reconciliation is for.
 *
 * C-5 — `duplicated_document` and `already_exists` are 4xx too, but they mean
 * the OPPOSITE: Siigo is refusing the request precisely BECAUSE a document
 * already exists (`API_SIIGO_REFERENCIA_COMPLETA.md`, "duplicated_document
 * llega con HTTP 400 y significa lo contrario de 'no se creó nada'" — Siigo's
 * own recommended defense against this is the Idempotency-Key already in use
 * here). Treating them like any other 4xx made the final catch block RELEASE
 * the claim — "nothing happened, free to retry" — when a receptionist's next
 * click would then emit a genuinely duplicate, DIAN-stamped invoice. Excluding
 * them here routes into the same reconcile-by-marker path already used for
 * ambiguous 5xx failures, so the existing invoice is found and reported as
 * success instead.
 */
function provablyCreatedNothing(err: unknown): boolean {
  if (!(err instanceof SiigoApiError)) return false;
  if (err.code === "duplicated_document" || err.code === "already_exists") return false;
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
    const { consultationId: id, expectedTotal, payload } = invoiceRequestSchema.parse(body);
    consultationId = id;

    // C-11 / D. Checked here, BEFORE the claim is acquired and before Siigo is
    // touched: exactly the ordering bug C-6 describes in reverse. A payload
    // that fails this check has not reached Siigo, so the consultation must
    // not be left holding a claim in `unknown`.
    assertPayloadMatchesProvetTotal(payload, expectedTotal);

    // One emission attempt = one marker, reused across the internal retry so
    // reconciliation stays stable. The Idempotency-Key, by contrast, must be
    // fresh on the retry: Siigo records a key even when the request fails and
    // rejects its reuse with 400 documents_service (verified against the API).
    const emissionKey = req.headers.get("X-Idempotency-Key") ?? generateIdempotencyKey();

    // C-6. Validated HERE, before the claim is acquired and before Siigo is
    // authenticated: the same shape check `postToSiigo` runs deep inside
    // `submitInvoice` used to be the ONLY place this failed, which is AFTER
    // `acquireInvoiceClaim` below. A malformed header (a stray hyphen, over
    // 30 chars) never reaches Siigo — no fetch is made — but the consultation
    // was already left holding a claim, and the generic catch below reads
    // "not a SiigoApiError" as "cannot prove creation" and parks it in
    // `unknown` for a request that touched nothing. Failing fast here means
    // the claims table is never involved for a request that never left this
    // server.
    const keyCheck = idempotencyKeyHeaderSchema.safeParse(emissionKey);
    if (!keyCheck.success) {
      return NextResponse.json(
        { error: { code: "invalid_idempotency_key", message: keyCheck.error.issues[0]?.message ?? "Idempotency-Key inválido." } },
        { status: 400 },
      );
    }
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
    if (err instanceof ReconciliationTruncatedError) {
      // C-7. Not the same as "no lo encontré, no existe": the search gave up
      // after MAX_RECONCILE_PAGES without reaching the end of the listing, so
      // absence is unconfirmed. Surfaced with its own code/message rather than
      // folded into the generic 500 so staff know NOT to just retry.
      return NextResponse.json(
        {
          error: {
            code: "reconciliation_truncated",
            message: err.message,
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
    if (err instanceof EmissionTotalMismatchError) {
      return NextResponse.json({ error: { code: "total_mismatch", message: err.message } }, { status: 400 });
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
