import { z } from "zod";
import { SIIGO_API_BASE_URL, SiigoApiError } from "@/services/siigoApi";
import { siigoCreditNoteResponseSchema, type SiigoCreditNoteResponse } from "@/mappers/creditNote";
import { formatColombiaDate } from "@/schemas/provet";
import {
  AmbiguousReconciliationError,
  ReconciliationTruncatedError,
} from "@/services/invoiceReconciliation";

/**
 * Credit-note reconciliation — how the app answers "did Siigo actually
 * create that credit note?" after `POST /v1/credit-notes` fails ambiguously.
 *
 * Unlike invoice reconciliation, this needs NO marker in `observations`:
 * `GET /v1/credit-notes` echoes `invoice: {id, name}` — the GUID of the
 * invoice the credit note reverses — which this app already has before
 * emitting (it is the same GUID sent as `invoice` in the request). That is a
 * STRONGER anchor than the invoice-side marker: it cannot collide across
 * consultations the way a hand-built string could.
 */

/** Same list shape Siigo returns for invoices — reused for credit notes. */
const listedCreditNoteSchema = z
  .object({
    id: z.string(),
    invoice: z.object({ id: z.string() }).optional(),
  })
  .passthrough();

const listResponseSchema = z.object({
  results: z.array(listedCreditNoteSchema).default([]),
  pagination: z.object({ total_results: z.number().optional() }).partial().optional(),
});

const MAX_RECONCILE_PAGES = 5;

/** YYYY-MM-DD in Colombia time, offset by `daysAgo` (negative moves into the future). */
function colombiaDate(daysAgo = 0): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return formatColombiaDate(d);
}

/**
 * Look for a credit note whose `invoice.id` matches `invoiceId`. Returns
 * null only when Siigo answered and none exists — every failure to answer
 * throws (see `invoiceReconciliation.findInvoiceByMarker`, same reasoning).
 */
export async function findCreditNoteByInvoice(
  invoiceId: string,
  accessToken: string,
  partnerId: string,
): Promise<{ id: string } | null> {
  const matches: { id: string }[] = [];
  let lastPageWasFull = false;
  for (let page = 1; page <= MAX_RECONCILE_PAGES; page++) {
    const url =
      `${SIIGO_API_BASE_URL}/v1/credit-notes?created_start=${colombiaDate(1)}` +
      `&created_end=${colombiaDate(-1)}&page=${page}&page_size=100`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "Partner-Id": partnerId, Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new SiigoApiError("service_unavailable", "No se pudo verificar el estado de la nota crédito en Siigo.");
    }
    if (!res.ok) {
      throw new SiigoApiError("default", `La verificación de nota crédito en Siigo falló (HTTP ${res.status}).`, res.status);
    }
    const parsed = listResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new SiigoApiError("invalid_payload", "La respuesta de verificación de notas crédito no tiene el formato esperado.");
    }
    for (const cn of parsed.data.results) {
      if (cn.invoice?.id === invoiceId) matches.push({ id: cn.id });
    }
    lastPageWasFull = parsed.data.results.length === 100;
    if (!lastPageWasFull) break;
  }
  if (matches.length > 1) throw new AmbiguousReconciliationError(matches.length);
  if (matches.length === 0 && lastPageWasFull) {
    throw new ReconciliationTruncatedError(MAX_RECONCILE_PAGES);
  }
  return matches[0] ?? null;
}

/** Full detail for a credit note id found by reconciliation. */
export async function fetchCreditNoteDetail(
  creditNoteId: string,
  accessToken: string,
  partnerId: string,
): Promise<SiigoCreditNoteResponse> {
  let res: Response;
  try {
    res = await fetch(`${SIIGO_API_BASE_URL}/v1/credit-notes/${encodeURIComponent(creditNoteId)}`, {
      headers: { "Partner-Id": partnerId, Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new SiigoApiError("service_unavailable", "No se pudo leer la nota crédito verificada en Siigo.");
  }
  if (!res.ok) {
    throw new SiigoApiError("default", `No se pudo leer la nota crédito verificada (HTTP ${res.status}).`, res.status);
  }
  const parsed = siigoCreditNoteResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new SiigoApiError("invalid_payload", "La nota crédito verificada en Siigo no tiene el formato esperado.");
  }
  return parsed.data;
}

/**
 * Full reconciliation: does a credit note against `invoiceId` exist, and if
 * so, what is it? Returns null only when Siigo answered and it is genuinely
 * absent.
 */
export async function reconcileCreditNote(
  invoiceId: string,
  accessToken: string,
  partnerId: string,
): Promise<SiigoCreditNoteResponse | null> {
  const hit = await findCreditNoteByInvoice(invoiceId, accessToken, partnerId);
  if (!hit) return null;
  return fetchCreditNoteDetail(hit.id, accessToken, partnerId);
}
