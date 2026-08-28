"use client";

import { Search } from "lucide-react";
import {
  HISTORY_STATUS_FILTERS,
  type HistoryStatusFilter,
} from "@/mappers/invoiceHistory";

const STATUS_LABELS: Record<HistoryStatusFilter, string> = {
  All: "Todas",
  Accepted: "Aceptadas",
  Draft: "Borradores",
  Rejected: "Rechazadas",
  Annulled: "Anuladas",
};

interface HistoryFilterBarProps {
  search: string;
  status: HistoryStatusFilter;
  resultCount: number;
  onSearchChange: (value: string) => void;
  onStatusChange: (status: HistoryStatusFilter) => void;
}

/** Presentational search + DIAN status tabs. No internal state (parent-owned). */
export function HistoryFilterBar({
  search,
  status,
  resultCount,
  onSearchChange,
  onStatusChange,
}: HistoryFilterBarProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-grid-line px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-1">
        {HISTORY_STATUS_FILTERS.map((f) => {
          const active = f === status;
          return (
            <button
              key={f}
              type="button"
              onClick={() => onStatusChange(f)}
              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                active
                  ? "bg-clinical-blue text-white"
                  : "border border-grid-line text-muted hover:bg-cool-grey"
              }`}
            >
              {STATUS_LABELS[f]}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-2xs text-muted">{resultCount} resultados</span>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cliente, NIT o factura..."
            className="w-56 rounded-md border border-grid-line bg-pure-white py-1 pl-7 pr-2 text-xs text-slate-text focus:border-clinical-blue focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
