import type { ProvetInvoiceRaw } from "@/schemas/provetApi";
import { extractId } from "@/mappers/provetToQueue";

/** Thrown when Provet reports no non-credit-note invoice for this consultation — nothing to verify the emission against. */
export class NoInvoiceForConsultationError extends Error {
  constructor(readonly consultationId: string) {
    super(
      `Provet no reporta ninguna factura para la consulta #${consultationId}. ` +
        `No se emite: no hay un total independiente contra el cual verificar el payload.`,
    );
    this.name = "NoInvoiceForConsultationError";
  }
}

/** Thrown when Provet reports more than one non-credit-note invoice for the same consultation — C-12 refuses to guess which is authoritative. */
export class AmbiguousConsultationInvoiceError extends Error {
  constructor(
    readonly consultationId: string,
    readonly count: number,
  ) {
    super(
      `Provet reporta ${count} facturas (no nota crédito) para la consulta #${consultationId}. ` +
        `No se emite: revise en Provet Cloud cuál es la correcta antes de reintentar.`,
    );
    this.name = "AmbiguousConsultationInvoiceError";
  }
}

/**
 * C-12 — independently re-derive the Provet header total for `consultationId`
 * from a freshly fetched, server-controlled list of Provet invoices, so the
 * caller's `assertPayloadMatchesProvetTotal` check no longer depends on a
 * client-supplied `expectedTotal` that a crafted request could make agree
 * with a wrong `items` array.
 *
 * Mirrors `invoiceByConsultation` in `provetToQueue.ts` — same field
 * (`total_with_vat ?? total`), same join key (`extractId(inv.consultation)`).
 * `!inv.credit_note` is defense in depth, not the primary filter: a credit
 * note's `consultation` is always `null` per measured evidence, so it can
 * never match a real consultation id here regardless.
 *
 * Deliberately does NOT replicate `invoiceByConsultation`'s `Map.set`
 * "last one wins" behaviour for duplicates. More than one matching invoice
 * is a fiscal ambiguity — which one is correct is not this code's call.
 */
export function resolveConsultationInvoiceTotal(
  consultationId: string,
  invoices: readonly ProvetInvoiceRaw[],
): number {
  const matches = invoices.filter(
    (inv) => !inv.credit_note && extractId(inv.consultation) === consultationId,
  );
  if (matches.length === 0) throw new NoInvoiceForConsultationError(consultationId);
  if (matches.length > 1) throw new AmbiguousConsultationInvoiceError(consultationId, matches.length);
  const invoice = matches[0];
  return invoice.total_with_vat ?? invoice.total ?? 0;
}
