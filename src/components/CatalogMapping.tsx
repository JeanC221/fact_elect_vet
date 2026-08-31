"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Pagination, PAGE_SIZE_OPTIONS, type PageSizeOption } from "./Pagination";
import { rankSiigoProductsFor } from "@/mappers/catalogMapping";
import type { ItemMappingRow } from "@/mappers/catalogMapping";
import type { SiigoProduct } from "@/schemas/siigo";

interface CatalogMappingProps {
  rows: ItemMappingRow[];
  siigoProducts: SiigoProduct[];
  onSelect: (provetCode: string, siigoProductId: string | null) => void;
  isRefreshing?: boolean;
  onSync?: () => void;
}

const COLUMNS = [
  "Código Provet",
  "Ítem Provet",
  "Producto Siigo",
  "Clasificación",
  "Estado",
] as const;

const TAX_LABELS: Record<string, string> = {
  IVA_19: "IVA 19%",
  IVA_5: "IVA 5%",
  EXCLUIDO: "Excluido",
  EXENTO: "Exento",
  INC: "INC",
};

export function CatalogMapping({ rows, siigoProducts, onSelect, isRefreshing, onSync }: CatalogMappingProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(PAGE_SIZE_OPTIONS[0]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size as PageSizeOption);
    setPage(1);
  };

  const mappedCount = rows.filter((r) => r.mapped).length;

  return (
    <section className="flex flex-col rounded-md border border-grid-line bg-pure-white">
      <div className="flex items-center justify-between border-b border-grid-line px-3 py-2">
        <h2 className="text-base font-semibold text-slate-text">Ítems / Servicios</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{mappedCount}/{rows.length} mapeados</span>
          {onSync && (
            <button type="button" onClick={onSync} disabled={isRefreshing} className="inline-flex items-center gap-1 rounded-md border border-grid-line px-2 py-1 text-xs font-semibold text-muted hover:bg-cool-grey disabled:opacity-40">
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" /> Sincronizar Catálogos
            </button>
          )}
        </div>
      </div>
      <div className="scrollbar-thin max-h-[40vh] overflow-y-auto">
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
                  Sin ítems para mapear.
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => {
                // Best-name-match first so the likely correct product is at the top of the dropdown.
                const rankedProducts = rankSiigoProductsFor(row.provetName, siigoProducts);
                return (
                  <tr key={row.provetCode} className="border-b border-grid-line hover:bg-cool-grey">
                    <td className="truncate px-3 py-2 font-medium text-slate-text" title={row.provetCode}>
                      {row.provetCode}
                    </td>
                    <td className="border-l border-grid-line px-3 py-2 text-slate-text" title={row.provetName}>
                      <div className="truncate">{row.provetName}</div>
                    </td>
                    <td className="border-l border-grid-line px-3 py-2">
                      <select
                        value={row.siigoProductId ?? ""}
                        onChange={(e) =>
                          onSelect(row.provetCode, e.target.value || null)
                        }
                        className="w-full rounded-md border border-grid-line bg-pure-white px-1 py-1 text-xs text-slate-text focus:border-clinical-blue focus:outline-none"
                        aria-label={`Producto Siigo para ${row.provetCode}`}
                      >
                        <option value="">— Sin mapear —</option>
                        {rankedProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} · {p.name} · {p.unit?.name ?? p.unit?.code ?? "sin unidad"}
                          </option>
                        ))}
                      </select>
                      {row.lowConfidence && (
                        <div className="mt-1 flex items-start gap-1 text-[11px] font-medium text-status-draft-text">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>Nombres muy distintos — confirme que este es el producto correcto.</span>
                        </div>
                      )}
                    </td>
                    <td className="border-l border-grid-line px-3 py-2 text-muted">
                      {row.siigoTaxClassification ? TAX_LABELS[row.siigoTaxClassification] ?? row.siigoTaxClassification : "—"}
                    </td>
                    <td className="border-l border-grid-line px-3 py-2">
                      {row.mapped ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-status-accepted-border bg-status-accepted-bg px-2 py-0.5 text-xs font-semibold text-status-accepted-text">
                          <CheckCircle2 className="h-3 w-3" /> Mapeado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-status-draft-border bg-status-draft-bg px-2 py-0.5 text-xs font-semibold text-status-draft-text">
                          <AlertTriangle className="h-3 w-3" /> Sin mapear
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={rows.length}
        onPageChange={setPage}
        onPageSizeChange={handlePageSizeChange}
      />
    </section>
  );
}