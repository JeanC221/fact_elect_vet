import { z } from "zod";
import { SIIGO_API_BASE_URL, SiigoApiError } from "@/services/siigoApi";
import { siigoInvoiceResponseSchema, type SiigoInvoiceResponse } from "@/schemas/siigo";

/**
 * Reconciliation — how the app answers "did Siigo actually create that
 * document?" after a request fails ambiguously.
 *
 * A 5xx, a timeout or a dropped socket proves nothing: the invoice may have
 * been stamped and only the response lost. Retrying blindly risks a duplicate
 * DIAN document; blocking the consultation forever punishes the receptionist
 * for someone else's outage. The industry answer is neither — it is to ASK the
 * provider.
 *
 * Siigo exposes no lookup by our own consultation id, so the app writes a
 * marker into `observations` on every invoice and searches for it afterwards.
 * Verified against the live Siigo API: `observations` round-trips through
 * POST /v1/invoices and is returned by GET /v1/invoices.
 *
 * Measured on the Siigo sandbox: POST /v1/invoices returns HTTP 500
 * `unhandled_error` on roughly 1 request in 10, with an identical payload,
 * for both `price` and `taxed_price`. Without reconciliation that is a 10%
 * rate of consultations wedged into manual unblocking.
 */

/**
 * Marker embedded in `observations`.
 *
 * Scoped to the emission attempt, not just the consultation: after an
 * annulment the same consultation is billed again, and a consultation-only
 * marker would match the OLD invoice and wrongly report success.
 */
export function buildEmissionMarker(emissionKey: string): string {
  return `FEV:${emissionKey}`;
}

/** Staff-facing note stored on the Siigo document. */
export function buildObservations(consultationId: string, emissionKey: string): string {
  return `Consulta Provet #${consultationId} · ${buildEmissionMarker(emissionKey)}`;
}

const listedInvoiceSchema = z
  .object({
    id: z.string(),
    number: z.number().optional(),
    observations: z.string().nullable().optional(),
  })
  .passthrough();

const listResponseSchema = z.object({
  results: z.array(listedInvoiceSchema).default([]),
  pagination: z.object({ total_results: z.number().optional() }).partial().optional(),
});

export interface ReconciledInvoice {
  id: string;
  number?: number;
}

/** Thrown when a credit-note lookup matches more than one document — never guess which. */
export class AmbiguousReconciliationError extends Error {
  constructor(public readonly matches: number) {
    super(`La verificación encontró ${matches} facturas con la misma marca de emisión.`);
    this.name = "AmbiguousReconciliationError";
  }
}

/**
 * C-7 — thrown when the search exhausts `MAX_RECONCILE_PAGES` and the LAST
 * page fetched was still full (100 results): Siigo may hold more documents
 * beyond the window this function looked at, so finding nothing here does
 * NOT mean the marker is absent — it means the search gave up too early.
 *
 * Without this, `findInvoiceByMarker` returns `null` for "I stopped looking"
 * exactly as it would for "I looked everywhere and it isn't there", and the
 * caller (which treats `null` as license to retry) emits a SECOND,
 * DIAN-stamped invoice for a consultation that may already have one sitting
 * on page 6.
 *
 * Deliberately does NOT fire when at least one match was already found: at
 * that point the marker's existence is already confirmed, and refusing to
 * report a hit the code actually saw would trade one false negative for a
 * useless one.
 */
export class ReconciliationTruncatedError extends Error {
  constructor(public readonly pagesSearched: number) {
    super(
      `La verificación en Siigo se detuvo tras revisar ${pagesSearched} páginas ` +
        `(${pagesSearched * 100} documentos) sin llegar al final del listado. No se puede confirmar si la factura ` +
        `existe o no — reintentar la emisión a ciegas podría duplicarla. Revise manualmente en Siigo Nube antes de reintentar.`,
    );
    this.name = "ReconciliationTruncatedError";
  }
}

/** YYYY-MM-DD in Colombia time, offset by `daysAgo` (negative moves into the future — used by C-4 to reach tomorrow). */
function colombiaDate(daysAgo = 0): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
}

const MAX_RECONCILE_PAGES = 5;

/**
 * Look for an invoice carrying `marker`. Returns null when none exists.
 *
 * The window starts yesterday, not today: an emission at 23:59 COT that is
 * reconciled a few seconds later would otherwise search the wrong day.
 *
 * C-4 — the window ENDS tomorrow, not today. Siigo documents `created_start`/
 * `created_end` as RFC3339 `date-time` but accepts a bare `yyyy-MM-dd`, which
 * it then reads as `T00:00:00`: `created_end=<hoy>` silently excludes
 * everything created today after midnight (`API_SIIGO_REFERENCIA_COMPLETA.md`,
 * "Trampa de fechas sin hora" — Siigo's own recommendation is exactly this,
 * extend `created_end` to tomorrow). Reconciliation runs moments after
 * emitting, so the invoice being searched for is almost always "created
 * today" — with `created_end=hoy` this always returns null, which the caller
 * reads as "Siigo never created it" and emits a SECOND, DIAN-stamped invoice
 * for the same consultation.
 *
 * Errors are NOT swallowed. If the lookup itself fails, the caller must treat
 * the outcome as unresolved and block — a failed check is not evidence of
 * absence, and silently returning null here would turn it into one.
 */
export async function findInvoiceByMarker(
  marker: string,
  accessToken: string,
  partnerId: string,
): Promise<ReconciledInvoice | null> {
  const matches: ReconciledInvoice[] = [];
  let lastPageWasFull = false;
  for (let page = 1; page <= MAX_RECONCILE_PAGES; page++) {
    const url =
      `${SIIGO_API_BASE_URL}/v1/invoices?created_start=${colombiaDate(1)}` +
      `&created_end=${colombiaDate(-1)}&page=${page}&page_size=100`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "Partner-Id": partnerId, Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new SiigoApiError("service_unavailable", "No se pudo verificar el estado de la factura en Siigo.");
    }
    if (!res.ok) {
      throw new SiigoApiError("default", `La verificación en Siigo falló (HTTP ${res.status}).`, res.status);
    }
    const parsed = listResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new SiigoApiError("invalid_payload", "La respuesta de verificación de Siigo no tiene el formato esperado.");
    }
    for (const inv of parsed.data.results) {
      if ((inv.observations ?? "").includes(marker)) matches.push({ id: inv.id, number: inv.number });
    }
    lastPageWasFull = parsed.data.results.length === 100;
    if (!lastPageWasFull) break;
  }
  if (matches.length > 1) throw new AmbiguousReconciliationError(matches.length);
  // C-7. `matches.length === 0` alone is not proof of absence when the last
  // page examined was still full: there may be more documents past
  // MAX_RECONCILE_PAGES that were never looked at. A confirmed hit, by
  // contrast, needs no such caveat — see ReconciliationTruncatedError.
  if (matches.length === 0 && lastPageWasFull) {
    throw new ReconciliationTruncatedError(MAX_RECONCILE_PAGES);
  }
  return matches[0] ?? null;
}

/**
 * Full document record for an id found by reconciliation.
 *
 * GET /v1/invoices (the list endpoint) does NOT return the `stamp` block, so
 * it carries no CUFE and no DIAN status — the two things the history row needs
 * most. A second call to the detail endpoint is the only way to get them.
 */
export async function fetchInvoiceDetail(
  invoiceId: string,
  accessToken: string,
  partnerId: string,
): Promise<SiigoInvoiceResponse> {
  let res: Response;
  try {
    res = await fetch(`${SIIGO_API_BASE_URL}/v1/invoices/${encodeURIComponent(invoiceId)}`, {
      headers: { "Partner-Id": partnerId, Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new SiigoApiError("service_unavailable", "No se pudo leer la factura verificada en Siigo.");
  }
  if (!res.ok) {
    throw new SiigoApiError("default", `No se pudo leer la factura verificada (HTTP ${res.status}).`, res.status);
  }
  const parsed = siigoInvoiceResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new SiigoApiError("invalid_payload", "La factura verificada en Siigo no tiene el formato esperado.");
  }
  return parsed.data;
}

/**
 * Full reconciliation: does a document with this marker exist, and if so, what
 * is it? Returns null only when Siigo answered and the document is genuinely
 * absent — every failure to answer throws, so the caller can never mistake
 * "could not check" for "does not exist".
 */
export async function reconcileInvoice(
  marker: string,
  accessToken: string,
  partnerId: string,
): Promise<SiigoInvoiceResponse | null> {
  const hit = await findInvoiceByMarker(marker, accessToken, partnerId);
  if (!hit) return null;
  return fetchInvoiceDetail(hit.id, accessToken, partnerId);
}
