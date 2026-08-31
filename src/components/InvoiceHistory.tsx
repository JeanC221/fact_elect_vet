"use client";

import { useMemo, useState } from "react";
import { Ban, Code, Eye, FileText, Loader2 } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { HistoryFilterBar } from "./HistoryFilterBar";
import {
  PAGE_SIZE_OPTIONS,
  Pagination,
  type PageSizeOption,
} from "./Pagination";
import {
  buildInvoiceHistory,
  filterInvoiceHistory,
  paginateHistory,
  type HistoryStatusFilter,
  type InvoiceHistoryEntry,
  type InvoiceHistoryRow,
} from "@/mappers/invoiceHistory";
import {
  formatDate,
  type ConsultationQueueRow,
} from "@/mappers/consultationQueue";

const COLUMNS = [
  "Factura",
  "Cliente",
  "Paciente",
  "Total",
  "Pago",
  "Emitida",
  "Estado DIAN",
  "PDF/XML",
] as const;

interface InvoiceHistoryProps {
  entries: InvoiceHistoryEntry[];
  rows: ConsultationQueueRow[];
  busyDownload?: { invoiceId: string; format: "pdf" | "xml" } | null;
  onDownload?: (invoiceId: string, format: "pdf" | "xml") => void;
  onAnnul?: (invoiceId: string) => void;
  onViewSnapshot?: (row: InvoiceHistoryRow) => void;
}

export function InvoiceHistory({
  entries,
  rows,
  busyDownload = null,
  onDownload,
  onAnnul,
  onViewSnapshot,
}: InvoiceHistoryProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<HistoryStatusFilter>("All");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(PAGE_SIZE_OPTIONS[0]);

  const historyRows = useMemo(() => buildInvoiceHistory(entries, rows), [
    entries,
    rows,
  ]);
  const filtered = useMemo(
    () => filterInvoiceHistory(historyRows, { search, status }),
    [historyRows, search, status],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const { slice } = paginateHistory(filtered, safePage, pageSize);

  const handlePageSize = (size: number) => {
    setPageSize(size as PageSizeOption);
    setPage(1);
  };

  const emptyMsg =
    historyRows.length === 0 ? "Sin facturas emitidas." : "Sin resultados para la búsqueda.";

  return (
    <section className="flex h-[calc(100vh-120px)] flex-col rounded-md border border-grid-line bg-pure-white">
      <div className="border-b border-grid-line px-3 py-2">
        <h2 className="text-base font-semibold text-slate-text">Historial de Facturas</h2>
      </div>
      <HistoryFilterBar
        search={search}
        status={status}
        resultCount={filtered.length}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        onStatusChange={(s) => { setStatus(s); setPage(1); }}
      />
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-pure-white">
            <tr className="border-b border-grid-line">
              {COLUMNS.map((col, i) => (
                <th key={col} className={`px-3 py-2 text-left font-semibold text-muted ${i < COLUMNS.length - 1 ? "border-r border-grid-line" : ""}`}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-muted">{emptyMsg}</td></tr>
            ) : (
              slice.map((r) => (
                <tr key={r.invoiceId} className="border-b border-grid-line hover:bg-cool-grey">
                  <td className="px-3 py-2 font-medium text-slate-text" title={r.invoiceId}>
                    {r.invoiceNumber ?? r.invoiceId}
                    {r.cufe ? (
                      <div className="truncate font-normal text-2xs text-muted" title={r.cufe}>CUFE: {r.cufe.slice(0, 12)}…</div>
                    ) : (
                      <div className="text-2xs text-muted">CUFE: —</div>
                    )}
                  </td>
                  <td className="border-l border-grid-line px-3 py-2">
                    <div className="truncate text-slate-text" title={r.clientName}>{r.clientName}</div>
                    <div className="truncate text-muted" title={r.clientDoc}>{r.clientDoc}</div>
                  </td>
                  <td className="border-l border-grid-line px-3 py-2 text-slate-text">{r.patientName}</td>
                  <td className="border-l border-grid-line px-3 py-2 font-medium text-slate-text">{r.total}</td>
                  <td className="border-l border-grid-line px-3 py-2 text-slate-text">{r.paymentMethod}</td>
                  <td className="border-l border-grid-line px-3 py-2 text-muted">{formatDate(r.emittedAt)}</td>
                  <td className="border-l border-grid-line px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="border-l border-grid-line px-3 py-2">
                    <div className="flex items-center gap-1">
                      {onViewSnapshot && (
                        <button type="button" onClick={() => onViewSnapshot(r)} className="rounded-md border border-grid-line p-1 text-muted hover:bg-cool-grey hover:text-clinical-blue" aria-label="Ver datos enviados" title="Ver datos enviados">
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                      <button type="button" disabled={busyDownload?.invoiceId === r.invoiceId} onClick={() => onDownload?.(r.invoiceId, "pdf")} className="rounded-md border border-grid-line p-1 text-muted hover:bg-cool-grey hover:text-clinical-blue disabled:opacity-50" aria-label="Descargar PDF" title="Descargar PDF">
                        {busyDownload?.invoiceId === r.invoiceId && busyDownload.format === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5" aria-hidden="true" />}
                      </button>
                      <button type="button" disabled={busyDownload?.invoiceId === r.invoiceId || r.status !== "Accepted"} onClick={() => onDownload?.(r.invoiceId, "xml")} className="rounded-md border border-grid-line p-1 text-muted hover:bg-cool-grey hover:text-clinical-blue disabled:opacity-50" aria-label="Descargar XML" title={r.status === "Accepted" ? "Descargar XML" : "XML disponible solo tras ser aceptada por la DIAN"}>
                        {busyDownload?.invoiceId === r.invoiceId && busyDownload.format === "xml" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Code className="h-3.5 w-3.5" aria-hidden="true" />}
                      </button>
                      {r.status === "Accepted" && onAnnul && (
                        <button type="button" onClick={() => onAnnul(r.invoiceId)} className="rounded-md border border-grid-line p-1 text-muted hover:bg-cool-grey hover:text-status-rejected-text" aria-label="Anular factura" title="Anular factura">
                          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={safePage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={handlePageSize} />
    </section>
  );
}