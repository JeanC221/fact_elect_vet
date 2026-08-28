import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE_OPTIONS = [15, 25, 50] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/**
 * Controlled explicit pagination control with record counts.
 * No infinite scroll (clinical spec §2.2). Parent owns state.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex items-center justify-between gap-4 border-t border-grid-line bg-pure-white px-3 py-2 text-xs">
      <div className="text-muted">
        Mostrando <span className="font-medium text-slate-text">{start}</span>
        –<span className="font-medium text-slate-text">{end}</span> de{" "}
        <span className="font-medium text-slate-text">{total}</span> registros
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1 text-muted">
          Filas:
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-grid-line bg-pure-white px-1 py-0.5 text-xs text-slate-text focus:border-clinical-blue focus:outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={!canPrev}
            className="rounded-md border border-grid-line p-1 text-slate-text disabled:cursor-not-allowed disabled:opacity-40 hover:bg-cool-grey"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-slate-text">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={!canNext}
            className="rounded-md border border-grid-line p-1 text-slate-text disabled:cursor-not-allowed disabled:opacity-40 hover:bg-cool-grey"
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
