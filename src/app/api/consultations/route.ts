import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getProvetAccessToken, ProvetAuthError } from "@/services/provetAuth";
import {
  fetchConsultations,
  fetchClients,
  fetchPatients,
  fetchInvoices,
  fetchPhoneNumbers,
  fetchConsultationItems,
  fetchInvoiceRows,
  syncWindowDays,
  ProvetApiError,
} from "@/services/provetApi";
import { buildQueueFromProvet } from "@/mappers/provetToQueue";
import { requireSession } from "@/services/routeGuard";

export const dynamic = "force-dynamic";

/**
 * Rate limits are enforced per endpoint over a rolling 60-second window, not
 * globally (developers.provetcloud.com/restapi/ratelimit.html), so firing
 * these 7 calls in parallel spends one request against seven SEPARATE budgets
 * rather than seven against one.
 *
 * Steady-state cost per device: 3 polls/min (NEXT_PUBLIC_QUEUE_POLL_MS = 20s)
 * = 3 requests/min against each of the 7 endpoints. With the real team
 * (owner + receptionists, ~4 devices) that is ~12 requests/min per endpoint.
 *
 * The unresolved multiplier is the per-call WEIGHT: a custom page_size counts
 * as `ceil(requested_page_size / endpoint_default_page_size)` requests.
 * provetApi.ts requests page_size=1000 and follows the `next` links to the
 * end (firstPage(), despite its name, is NOT single-page); the defaults are only
 * published in each endpoint's own Provet REST API Schema page, which needs
 * production credentials to inspect. If a default turned out to be 20, the
 * weight could be substantial and the figure above rises accordingly —
 * still plausibly within budget, but unverified. Confirm the defaults once
 * production credentials exist and revisit NEXT_PUBLIC_QUEUE_POLL_MS then.
 *
 * Client-side deduplication (interval + focus + visibilitychange + extra tabs
 * collapsed into one poll per device) lives in consultationQueueCache.ts.
 * Cross-DEVICE coordination is deliberately not implemented — rationale in
 * useConsultationQueue.ts.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;
  try {
    const token = await getProvetAccessToken();
    const [consultations, clients, patients, invoices, phoneNumbers, consultationItems, invoiceRows] =
      await Promise.all([
        fetchConsultations(token),
        fetchClients(token),
        fetchPatients(token),
        fetchInvoices(token),
        fetchPhoneNumbers(token),
        fetchConsultationItems(token),
        fetchInvoiceRows(token),
      ]);
    const rows = buildQueueFromProvet(
      consultations, clients, patients, invoices, phoneNumbers, consultationItems, invoiceRows,
    );
    // `meta` exists so an empty queue is never ambiguous. Provet returning
    // zero consultations looks identical, on screen, to "nothing left to
    // invoice" — and a misconfigured PROVET_SYNC_WINDOW_DAYS produces exactly
    // that (a 30-day window against a tenant whose data is older returns 0 on
    // every endpoint). Reporting what was actually fetched, and over what
    // window, lets the UI say which of the two it is instead of showing a
    // silent blank list.
    return NextResponse.json({
      rows,
      count: rows.length,
      meta: {
        provetConsultations: consultations.length,
        syncWindowDays: syncWindowDays(),
      },
    });
  } catch (err) {
    const code = err instanceof ProvetAuthError || err instanceof ProvetApiError ? err.code : "unknown";
    const message = err instanceof Error ? err.message : "Error desconocido al consultar Provet.";
    return NextResponse.json({ error: { code, message }, rows: [], count: 0 }, { status: 502 });
  }
}