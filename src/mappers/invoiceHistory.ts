import { z } from "zod";
import type { SiigoInvoiceResponse } from "@/schemas/siigo";
import type {
  ConsultationQueueRow,
  InvoiceStatus,
} from "@/mappers/consultationQueue";

/** Persisted emission record linking a Siigo invoice to its Provet consultation. */
export interface InvoiceHistoryEntry {
  invoiceId: string;
  cufe: string;
  status: InvoiceStatus;
  consultationId: string;
  /** Provet payment method label chosen by staff at emission time (e.g. "Efectivo"). Not sourced from Provet's API — selected manually in the Quick-Edit drawer. */
  paymentMethod: string;
  observations?: string;
  emittedAt: Date;
}

/** Zod schema for persisted history entries (runtime validation on load). */
export const invoiceHistoryEntrySchema = z.object({
  invoiceId: z.string().trim().min(1),
  cufe: z.string(),
  status: z.enum(["Accepted", "Draft", "Rejected", "Annulled"]),
  consultationId: z.string().trim().min(1),
  paymentMethod: z.string().default(""),
  observations: z.string().optional(),
  emittedAt: z.coerce.date(),
});

/** Zod-validated JSON serialization of the full history array for localStorage persistence. */
export function serializeInvoiceHistory(entries: InvoiceHistoryEntry[]): string {
  return JSON.stringify(z.array(invoiceHistoryEntrySchema).parse(entries));
}
/** Parse + Zod-validate a stored JSON blob; throws on corrupt/invalid input. */
export function parseInvoiceHistory(stored: string): InvoiceHistoryEntry[] {
  return z.array(invoiceHistoryEntrySchema).parse(JSON.parse(stored));
}

/** Table view-model for the history table (joined with the consultation queue row). */
export interface InvoiceHistoryRow {
  invoiceId: string;
  cufe: string;
  status: InvoiceStatus;
  consultationId: string;
  clientName: string;
  clientDoc: string;
  patientName: string;
  total: number;
  paymentMethod: string;
  emittedAt: Date;
}

/** DIAN status filter tabs for the history view. */
export type HistoryStatusFilter = "All" | InvoiceStatus;
export const HISTORY_STATUS_FILTERS: HistoryStatusFilter[] = [
  "All",
  "Accepted",
  "Draft",
  "Rejected",
  "Annulled",
];

/** Known Siigo invoice statuses this app models explicitly. */
const KNOWN_INVOICE_STATUSES: readonly InvoiceStatus[] = ["Accepted", "Draft", "Rejected", "Annulled"];

export function mapSiigoInvoiceStatus(raw: string): InvoiceStatus {
  return (KNOWN_INVOICE_STATUSES as readonly string[]).includes(raw)
    ? (raw as InvoiceStatus)
    : "Draft";
}

/** Pure factory: build a persisted entry from a Siigo response + consultation link. */
export function toInvoiceHistoryEntry(
  response: SiigoInvoiceResponse,
  consultationId: string,
  emittedAt: Date,
  paymentMethod: string = "",
): InvoiceHistoryEntry {
  return {
    invoiceId: response.id,
    cufe: response.cufe,
    status: mapSiigoInvoiceStatus(response.status),
    consultationId,
    paymentMethod,
    observations: response.observations,
    emittedAt,
  };
}

/** Pure O(n) join of persisted entries with consultation rows via a Map lookup. */
export function buildInvoiceHistory(
  entries: InvoiceHistoryEntry[],
  rows: ConsultationQueueRow[],
): InvoiceHistoryRow[] {
  const rowMap = new Map(rows.map((r) => [r.id, r]));
  return entries.map((e) => {
    const r = rowMap.get(e.consultationId);
    return {
      invoiceId: e.invoiceId,
      cufe: e.cufe,
      status: e.status,
      consultationId: e.consultationId,
      clientName: r?.clientName ?? "Cliente desconocido",
      clientDoc: r?.clientDoc ?? "—",
      patientName: r?.patientName ?? "Paciente desconocido",
      total: r?.total ?? 0,
      paymentMethod: e.paymentMethod || "Pendiente",
      emittedAt: e.emittedAt,
    };
  });
}

export interface HistoryFilter {
  search: string;
  status: HistoryStatusFilter;
}

/** Pure O(n) case-insensitive filter on client name, NIT/document, or invoice id. */
export function filterInvoiceHistory(
  rows: InvoiceHistoryRow[],
  filter: HistoryFilter,
): InvoiceHistoryRow[] {
  const q = filter.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (filter.status !== "All" && r.status !== filter.status) return false;
    if (!q) return true;
    return (
      r.clientName.toLowerCase().includes(q) ||
      r.clientDoc.toLowerCase().includes(q) ||
      r.invoiceId.toLowerCase().includes(q)
    );
  });
}

/** Pure pagination helper: returns the visible slice and the total count. */
export function paginateHistory(
  rows: InvoiceHistoryRow[],
  page: number,
  pageSize: number,
): { slice: InvoiceHistoryRow[]; total: number } {
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return { slice: rows.slice(start, start + pageSize), total };
}