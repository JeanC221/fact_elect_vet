"use client";

import { useMemo, useState } from "react";
import { Clock, FileText, Loader2, RefreshCw } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { Pagination, PAGE_SIZE_OPTIONS, type PageSizeOption } from "./Pagination";
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

const COLUMNS = ["Consulta", "Cliente", "Paciente", "Total", "Pago", "Fecha", "Estado DIAN", ""] as const;

export function ConsultationQueue({ rows, onInvoiceClick, isRefreshing, isInitialLoading, disableActions, onRefresh }: ConsultationQueueProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(PAGE_SIZE_OPTIONS[0]);

  const pagedRows = useMemo(() => {
    const startIdx = (page - 1) * pageSize;
    return rows.slice(startIdx, startIdx + pageSize);
  }, [rows, page, pageSize]);

  return (
    <section className="flex h-[calc(100vh-120px)] flex-col rounded-md border border-grid-line bg-pure-white">
      <div className="flex items-center justify-between border-b border-grid-line px-3 py-2">
        <h2 className="text-base font-semibold text-slate-text">Cola de Consultas</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{rows.length} consultas</span>
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
              {COLUMNS.map((col, i) => (
                <th
                  key={col}
                  className={`px-3 py-2 text-left font-semibold text-muted ${
                    i < COLUMNS.length - 1 ? "border-r border-grid-line" : ""
                  }`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-muted">
                  {isInitialLoading ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      Cargando consultas desde Provet…
                    </span>
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
                    {formatCOP(row.total)}
                  </td>
                  <td className="border-l border-grid-line px-3 py-2 text-slate-text">
                    {row.paymentMethod}
                  </td>
                  <td className="border-l border-grid-line px-3 py-2 text-muted">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="border-l border-grid-line px-3 py-2">
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={row.invoiceStatus} />
                      {row.provetStatus === "pending" && (
                        <span className="inline-flex items-center gap-0.5 text-2xs text-muted">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          Pendiente Provet
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="border-l border-grid-line px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onInvoiceClick?.(row.id)}
                      disabled={disableActions}
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
        total={rows.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size as PageSizeOption); setPage(1); }}
      />
    </section>
  );
}
