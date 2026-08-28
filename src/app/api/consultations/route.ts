import { NextResponse } from "next/server";
import { getProvetAccessToken, ProvetAuthError } from "@/services/provetAuth";
import {
  fetchConsultations,
  fetchClients,
  fetchPatients,
  fetchInvoices,
  ProvetApiError,
} from "@/services/provetApi";
import { buildQueueFromProvet } from "@/mappers/provetToQueue";

export const dynamic = "force-dynamic";

/**
 * GET /api/consultations — live Provet Cloud poll.
 * Orchestrates OAuth + the 4 resource fetches + the pure mapper server-side,
 * so client credentials never reach the browser. Returns dashboard queue rows
 * (or a 502 with a Spanish, user-facing error message on failure).
 */
export async function GET(): Promise<NextResponse> {
  try {
    const token = await getProvetAccessToken();
    const [consultations, clients, patients, invoices] = await Promise.all([
      fetchConsultations(token),
      fetchClients(token),
      fetchPatients(token),
      fetchInvoices(token),
    ]);
    const rows = buildQueueFromProvet(consultations, clients, patients, invoices);
    return NextResponse.json({ rows, count: rows.length });
  } catch (err) {
    const code = err instanceof ProvetAuthError || err instanceof ProvetApiError ? err.code : "unknown";
    const message = err instanceof Error ? err.message : "Error desconocido al consultar Provet.";
    return NextResponse.json({ error: { code, message }, rows: [], count: 0 }, { status: 502 });
  }
}
