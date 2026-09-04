import { getPool } from "@/services/db";

/**
 * Emission claims — the server-side guard against double-stamping the same
 * Provet consultation at the DIAN from two devices at once.
 *
 * Why this exists as its own table rather than a UNIQUE constraint on
 * `invoices.consultation_id`: the `invoices` row is only written AFTER Siigo
 * responds (from the client, via POST /api/invoice-history). A constraint
 * there fires one step too late — both invoices would already be stamped, and
 * the constraint would merely discard the record of the second one, leaving a
 * duplicate legal document that is invisible in the history table.
 *
 * The claim is taken BEFORE the Siigo call, inside the same request, so the
 * losing device never reaches Siigo at all. Atomicity comes from Postgres:
 * the claim is one `INSERT ... ON CONFLICT ... RETURNING` statement, so the
 * unique index picks exactly one winner across devices, lambdas and regions.
 * A `SELECT`-then-`INSERT` would reintroduce the very race being fixed.
 *
 * The constraint on `invoices.consultation_id` is deliberately NOT added as a
 * backstop: the annulment flow stores the credit note as a second `invoices`
 * row under the same consultation_id, so a unique index there would reject it
 * after the credit note was already stamped at the DIAN.
 */

/**
 * `pending`  — claim taken, the Siigo call is in flight (or the process died
 *              mid-flight and nobody ever resolved it).
 * `emitted`  — Siigo returned a document for this consultation.
 * `unknown`  — the Siigo call failed in a way that does NOT prove the document
 *              was not created (timeout, network drop, 5xx, unparseable
 *              response). Deliberately blocks re-emission: a timeout is not
 *              evidence of failure, and retrying it is exactly how duplicates
 *              get stamped.
 * `annulled` — the invoice was voided by a credit note. The consultation
 *              becomes billable again: voiding an erroneous invoice so a
 *              corrected one can be issued is the entire purpose of a credit
 *              note, and blocking re-emission would make annulment useless
 *              for the clinic's main case (wrong amount → annul → rebill).
 */
export type InvoiceClaimStatus = "pending" | "emitted" | "unknown" | "annulled";

export interface InvoiceClaim {
  consultationId: string;
  status: InvoiceClaimStatus;
  invoiceId: string | null;
  claimedAt: Date;
  lastError: string | null;
}

interface InvoiceClaimRow {
  consultation_id: string;
  status: string;
  invoice_id: string | null;
  claimed_at: Date;
  last_error: string | null;
}

function rowToClaim(row: InvoiceClaimRow): InvoiceClaim {
  return {
    consultationId: row.consultation_id,
    status: row.status as InvoiceClaimStatus,
    invoiceId: row.invoice_id,
    claimedAt: row.claimed_at instanceof Date ? row.claimed_at : new Date(row.claimed_at),
    lastError: row.last_error,
  };
}

/** Thrown when another device already holds the claim for this consultation. */
export class ConsultationAlreadyClaimedError extends Error {
  constructor(public readonly claim: InvoiceClaim | null, public readonly consultationId: string) {
    super("consultation_already_claimed");
    this.name = "ConsultationAlreadyClaimedError";
  }
}

/** Staff-facing Spanish explanation of why the 409 happened, per claim state. */
export function claimConflictMessage(claim: InvoiceClaim | null): string {
  if (!claim) {
    return "Esta consulta ya tiene una emisión en curso desde otro dispositivo. No se emitió una segunda factura.";
  }
  switch (claim.status) {
    case "emitted":
      return claim.invoiceId
        ? `Esta consulta ya fue facturada (factura ${claim.invoiceId}). No se emitió una segunda factura.`
        : "Esta consulta ya fue facturada. No se emitió una segunda factura.";
    case "unknown":
      return (
        "Esta consulta tiene una emisión previa cuyo resultado no se pudo confirmar (Siigo no respondió). " +
        "Verifique en Siigo Nube si la factura existe antes de reintentar. No se emitió una segunda factura."
      );
    case "annulled":
      // Unreachable in practice: an annulled claim is taken over by the
      // conditional upsert in acquireInvoiceClaim rather than conflicting.
      return "Esta consulta fue anulada y puede facturarse nuevamente. Recargue e intente otra vez.";
    case "pending":
    default:
      return (
        "Otro dispositivo está emitiendo la factura de esta consulta en este momento. " +
        "Espere a que termine y actualice el historial. No se emitió una segunda factura."
      );
  }
}

/** Read the current claim for a consultation, or null if none is held. */
export async function getInvoiceClaim(consultationId: string): Promise<InvoiceClaim | null> {
  const result = await getPool().query<InvoiceClaimRow>(
    "SELECT consultation_id, status, invoice_id, claimed_at, last_error FROM invoice_claims WHERE consultation_id = $1",
    [consultationId],
  );
  if (!result.rowCount) return null;
  return rowToClaim(result.rows[0]);
}

/**
 * Atomically claim a consultation for emission. Throws
 * ConsultationAlreadyClaimedError if another request already holds it.
 * MUST be called before the Siigo request, never after.
 */
export async function acquireInvoiceClaim(consultationId: string, idempotencyKey: string): Promise<void> {
  // The conditional DO UPDATE lets an ANNULLED consultation be re-claimed
  // (credit note voided the previous invoice, so re-billing is legitimate)
  // while still losing the race for pending/emitted/unknown. The WHERE clause
  // keeps this a single atomic statement — a read-then-branch would reopen the
  // race this whole module exists to close.
  const result = await getPool().query<{ consultation_id: string }>(
    `INSERT INTO invoice_claims (consultation_id, status, idempotency_key)
     VALUES ($1, 'pending', $2)
     ON CONFLICT (consultation_id) DO UPDATE
       SET status = 'pending',
           idempotency_key = EXCLUDED.idempotency_key,
           invoice_id = NULL,
           claimed_at = now(),
           resolved_at = NULL,
           last_error = NULL
       WHERE invoice_claims.status = 'annulled'
     RETURNING consultation_id`,
    [consultationId, idempotencyKey],
  );
  if (result.rowCount) return;
  // Lost the race. Re-read to tell the staff member which state blocked them.
  const existing = await getInvoiceClaim(consultationId).catch(() => null);
  throw new ConsultationAlreadyClaimedError(existing, consultationId);
}

/** Siigo returned a document — pin the claim permanently to that invoice. */
export async function markClaimEmitted(consultationId: string, invoiceId: string): Promise<void> {
  await getPool().query(
    `UPDATE invoice_claims
     SET status = 'emitted', invoice_id = $2, resolved_at = now(), last_error = NULL
     WHERE consultation_id = $1`,
    [consultationId, invoiceId],
  );
}

/**
 * The Siigo call failed in a way that does NOT prove the document was not
 * created. Keep the claim so nobody re-emits blindly.
 */
export async function markClaimUnknown(consultationId: string, reason: string): Promise<void> {
  await getPool().query(
    `UPDATE invoice_claims
     SET status = 'unknown', resolved_at = now(), last_error = $2
     WHERE consultation_id = $1`,
    [consultationId, reason.slice(0, 500)],
  );
}

/**
 * Release the claim. ONLY call this when it is provable that Siigo created
 * nothing (a 4xx rejection: the request was refused before any document was
 * written). Releasing on a timeout or a 5xx would re-open the duplicate hole.
 */
export async function releaseInvoiceClaim(consultationId: string): Promise<void> {
  await getPool().query("DELETE FROM invoice_claims WHERE consultation_id = $1", [consultationId]);
}

/**
 * A credit note voided the invoice for this consultation. Frees it for
 * re-billing via the conditional upsert in acquireInvoiceClaim, while keeping
 * a row (rather than deleting) so the last known invoice id stays visible to
 * the admin claims view. The full audit trail lives in `invoices`, which
 * retains both the annulled invoice and the credit note.
 */
export async function markClaimAnnulled(consultationId: string, creditNoteId: string): Promise<void> {
  await getPool().query(
    `UPDATE invoice_claims
     SET status = 'annulled', resolved_at = now(), last_error = NULL,
         invoice_id = $2
     WHERE consultation_id = $1`,
    [consultationId, creditNoteId],
  );
}

/** Result of an admin-initiated claim release. */
export type ClaimReleaseOutcome = "released" | "not_found" | "refused_emitted";

/** Claims an admin may need to act on: everything that is not a clean emission. */
export async function listOpenClaims(): Promise<InvoiceClaim[]> {
  const result = await getPool().query<InvoiceClaimRow>(
    `SELECT consultation_id, status, invoice_id, claimed_at, last_error
     FROM invoice_claims
     WHERE status <> 'emitted'
     ORDER BY claimed_at ASC`,
  );
  return result.rows.map(rowToClaim);
}

/**
 * Admin unblock for a stuck consultation — an `unknown` left by a timeout, or
 * a `pending` orphaned by a lambda that died mid-flight. Without this, a
 * single dropped connection wedges a consultation permanently and the only
 * remedy is hand-written SQL against production.
 *
 * `emitted` is deliberately NOT releasable: that claim is the only thing
 * standing between the clinic and a second DIAN document for an invoice that
 * demonstrably exists. The correct way to make an emitted consultation
 * billable again is a credit note, which routes through markClaimAnnulled.
 */
export async function releaseClaimAsAdmin(consultationId: string): Promise<ClaimReleaseOutcome> {
  const deleted = await getPool().query<{ consultation_id: string }>(
    `DELETE FROM invoice_claims
     WHERE consultation_id = $1 AND status <> 'emitted'
     RETURNING consultation_id`,
    [consultationId],
  );
  if (deleted.rowCount) return "released";
  const existing = await getInvoiceClaim(consultationId);
  return existing ? "refused_emitted" : "not_found";
}
