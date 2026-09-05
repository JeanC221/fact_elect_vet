import { NextResponse } from "next/server";
import { getProvetAccessToken, ProvetAuthError } from "@/services/provetAuth";
import {
  fetchConsultations,
  fetchClients,
  fetchPatients,
  fetchInvoices,
  fetchPhoneNumbers,
  fetchConsultationItems,
  ProvetApiError,
} from "@/services/provetApi";
import { buildQueueFromProvet } from "@/mappers/provetToQueue";

export const dynamic = "force-dynamic";

/**
 * Rate limits are enforced per endpoint over a rolling 60-second window, not
 * globally (developers.provetcloud.com/restapi/ratelimit.html), so firing
 * these 6 calls in parallel spends one request against six SEPARATE budgets
 * rather than six against one.
 *
 * Steady-state cost per device: 3 polls/min (NEXT_PUBLIC_QUEUE_POLL_MS = 20s)
 * = 3 requests/min against each of the 6 endpoints. With the real team
 * (owner + receptionists, ~4 devices) that is ~12 requests/min per endpoint.
 *
 * The unresolved multiplier is the per-call WEIGHT: a custom page_size counts
 * as `ceil(requested_page_size / endpoint_default_page_size)` requests.
 * provetApi.ts requests page_size=100; the per-endpoint defaults are only
 * published in each endpoint's own Provet REST API Schema page, which needs
 * production credentials to inspect. If a default turned out to be 20, the
 * weight would be 5 and the figure above becomes ~60/min per endpoint —
 * still plausibly within budget, but unverified. Confirm the defaults once
 * production credentials exist and revisit NEXT_PUBLIC_QUEUE_POLL_MS then.
 *
 * Client-side deduplication (interval + focus + visibilitychange + extra tabs
 * collapsed into one poll per device) lives in consultationQueueCache.ts.
 * Cross-DEVICE coordination is deliberately not implemented — rationale in
 * useConsultationQueue.ts.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const token = await getProvetAccessToken();
    const [consultations, clients, patients, invoices, phoneNumbers, consultationItems] = await Promise.all([
      fetchConsultations(token),
      fetchClients(token),
      fetchPatients(token),
      fetchInvoices(token),
      fetchPhoneNumbers(token),
      fetchConsultationItems(token),
    ]);
    const rows = buildQueueFromProvet(consultations, clients, patients, invoices, phoneNumbers, consultationItems);
    return NextResponse.json({ rows, count: rows.length });
  } catch (err) {
    const code = err instanceof ProvetAuthError || err instanceof ProvetApiError ? err.code : "unknown";
    const message = err instanceof Error ? err.message : "Error desconocido al consultar Provet.";
    return NextResponse.json({ error: { code, message }, rows: [], count: 0 }, { status: 502 });
  }
}