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