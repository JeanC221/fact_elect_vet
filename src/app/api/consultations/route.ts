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
 * Rate limits are enforced per endpoint (not globally) per Provet's docs
 * (developers.provetcloud.com/restapi/ratelimit.html), so firing these 6
 * calls in parallel does not itself exceed any single endpoint's budget.
 * The unresolved risk is the per-call WEIGHT: a custom page_size counts as
 * `ceil(requested_page_size / endpoint_default_page_size)` requests against
 * that endpoint's limit. page_size=1000 (see provetApi.ts) could weigh
 * several requests per call if an endpoint's default is low — the exact
 * defaults are only published in each endpoint's own Provet REST API Schema
 * page, which requires production credentials to inspect. Once confirmed,
 * revisit NEXT_PUBLIC_QUEUE_POLL_MS (useConsultationQueue.ts) accordingly.
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