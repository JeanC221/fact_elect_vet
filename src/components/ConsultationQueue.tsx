"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Clock, FileText, Loader2, RefreshCw, Search } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { SortableHeader } from "./SortableHeader";
import { Pagination, PAGE_SIZE_OPTIONS, type PageSizeOption } from "./Pagination";
import { nextSortState, sortRows, type SortState } from "@/mappers/tableSort";
import {
  formatCOP,
  formatDate,
  type ConsultationQueueRow,
} from "@/mappers/consultationQueue";

interface ConsultationQueueProps {
  rows: ConsultationQueueRow[];
  onInvoiceClick?: (id: string) => void;
  isRefreshing?: boolean;
  isInitialLoading?: boolean;
  disableActions?: boolean;
  onRefresh?: () => void;
}

type SortColumn = "id" | "clientName" | "patientName" | "total" | "paymentMethod" | "createdAt";
const SORT_EXTRACT: Record<SortColumn, (r: ConsultationQueueRow) => string | number | Date> = {
  id: (r) => r.id,
  clientName: (r) => r.clientName,
  patientName: (r) => r.patientName,
  total: (r) => r.total,
  paymentMethod: (r) => r.paymentMethod,
  createdAt: (r) => r.createdAt,
};

export function ConsultationQueue({ rows, onInvoiceClick, isRefreshing, isInitialLoading, disableActions, onRefresh }: ConsultationQueueProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(PAGE_SIZE_OPTIONS[0]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState<SortColumn> | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.clientName.toLowerCase().includes(q) ||
      r.clientDoc.toLowerCase().includes(q) ||
      r.patientName.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q));
  }, [rows, search]);

  const sorted = useMemo(
    () => sortRows(filtered, sort, (r, col) => SORT_EXTRACT[col](r)),
    [filtered, sort],
  );

  const pagedRows = useMemo(() => {
    const startIdx = (page - 1) * pageSize;
    return sorted.slice(startIdx, startIdx + pageSize);
  }, [sorted, page, pageSize]);

  const handleSort = (column: SortColumn) => { setSort((s) => nextSortState(s, column)); setPage(1); };
  const TH = "border-r border-grid-line px-3 py-2 text-left";

  return (
    <section className="flex h-[calc(100vh-120px)] flex-col rounded-md border border-grid-line bg-pure-white">
      <div className="flex items-center justify-between border-b border-grid-line px-3 py-2">
        <h2 className="text-base font-semibold text-slate-text">Cola de Consultas</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{filtered.length} consultas</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Cliente, paciente o consulta..."
              className="w-56 rounded-md border border-grid-line bg-pure-white py-1 pl-7 pr-2 text-xs text-slate-text focus:border-clinical-blue focus:outline-none"
            />
          </div>
          {onRefresh && (
            <button type="button" onClick={onRefresh} disabled={isRefreshing} className="inline-flex items-center gap-1 rounded-md border border-grid-line px-2 py-1 text-xs font-semibold text-muted hover:bg-cool-grey disabled:opacity-40">
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" /> Refrescar Atenciones
            </button>
          )}
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-pure-white">
            <tr className="border-b border-grid-line">
              <SortableHeader label="Consulta" column="id" sort={sort} onSort={handleSort} className={TH} />
              <SortableHeader label="Cliente" column="clientName" sort={sort} onSort={handleSort} className={TH} />
              <SortableHeader label="Paciente" column="patientName" sort={sort} onSort={handleSort} className={TH} />
              <SortableHeader label="Total" column="total" sort={sort} onSort={handleSort} className={TH} />
              <SortableHeader label="Pago" column="paymentMethod" sort={sort} onSort={handleSort} className={TH} />
              <SortableHeader label="Fecha" column="createdAt" sort={sort} onSort={handleSort} className={TH} />
              <th className={`${TH} font-semibold text-muted`}>Estado DIAN</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted">
                  {isInitialLoading ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      Cargando consultas desde Provet…
                    </span>
                  ) : search.trim() ? (
                    "Sin resultados para la búsqueda."
                  ) : (
                    "Sin consultas pendientes."
                  )}
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-grid-line hover:bg-cool-grey"
                >
                  <td className="truncate px-3 py-2 font-medium text-slate-text" title={row.id}>
                    {row.id}
                  </td>
                  <td className="border-l border-grid-line px-3 py-2">
                    <div className="truncate text-slate-text" title={row.clientName}>
                      {row.clientName}
                    </div>
                    <div className="truncate text-muted" title={row.clientDoc}>
                      {row.clientDoc}
                    </div>
                  </td>
                  <td className="border-l border-grid-line px-3 py-2 text-slate-text">
                    {row.patientName}
                  </td>
                  <td className="border-l border-grid-line px-3 py-2 font-medium text-slate-text">
                    {row.total}
                    {/* C-11: the disagreement is shown where the number is, not
                        as a separate badge, so the two amounts sit side by side. */}
                    {row.totalMismatch && (
                      <div
                        className="mt-0.5 inline-flex items-center gap-0.5 text-2xs font-medium text-status-rejected-text"
                        title={`La factura de Provet dice ${formatCOP(row.totalMismatch.expectedTotal)} y sus líneas suman ${formatCOP(row.totalMismatch.itemsTotal)}.`}
                      >
                        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                        Líneas: {formatCOP(row.totalMismatch.itemsTotal)}
                      </div>
                    )}
                  </td>
                  <td className="border-l border-grid-line px-3 py-2 text-slate-text">
                    {row.paymentMethod}
                  </td>
                  <td className="border-l border-grid-line px-3 py-2 text-muted">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="border-l border-grid-line px-3 py-2 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <StatusBadge status={row.invoiceStatus} />
                      {row.provetStatus === "pending" && (
                        <span className="inline-flex items-center gap-0.5 text-2xs text-muted">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          Pendiente Provet
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="border-l border-grid-line px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        try { onInvoiceClick?.(row.id); }
                        catch (err) { console.error("[ConsultationQueue] Failed to open Quick-Edit drawer for", row.id, err); }
                      }}
                      disabled={disableActions || row.totalMismatch !== null}
                      title={row.totalMismatch ? "Los totales de Provet no cuadran para esta consulta. Corríjala en Provet Cloud antes de facturar." : undefined}
                      className="inline-flex items-center gap-1 rounded-md bg-clinical-blue px-2 py-1 text-xs font-semibold text-white hover:bg-clinical-blue-hover active:bg-clinical-blue-active disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <FileText className="h-3 w-3" aria-hidden="true" />
                      Facturar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size as PageSizeOption); setPage(1); }}
      />
    </section>
  );
}