"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Pagination, PAGE_SIZE_OPTIONS, type PageSizeOption } from "./Pagination";
import type { PaymentMappingRow } from "@/mappers/catalogMapping";
import type { SiigoPaymentType } from "@/schemas/siigo";

interface PaymentMappingProps {
  rows: PaymentMappingRow[];
  siigoPaymentTypes: SiigoPaymentType[];
  onSelect: (provetMethod: string, siigoPaymentTypeId: number | null) => void;
}

const COLUMNS = [
  "Método Provet",
  "Tipo de Pago Siigo",
  "Categoría",
  "Estado",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  Cartera: "Cartera (venta)",
  CarteraProveedor: "Cartera/Proveedor",
};

export function PaymentMapping({ rows, siigoPaymentTypes, onSelect }: PaymentMappingProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(PAGE_SIZE_OPTIONS[0]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const selectableTypes = useMemo(
    () => siigoPaymentTypes.filter((pt) => pt.active !== false),
    [siigoPaymentTypes],
  );

  const handlePageSizeChange = (size: number) => {
    setPageSize(size as PageSizeOption);
    setPage(1);
  };

  const mappedCount = rows.filter((r) => r.mapped).length;

  return (
    <section className="flex flex-col rounded-md border border-grid-line bg-pure-white">
      <div className="flex items-center justify-between border-b border-grid-line px-3 py-2">
        <h2 className="text-base font-semibold text-slate-text">Métodos de Pago</h2>
        <span className="text-xs text-muted">
          {mappedCount}/{rows.length} mapeados
        </span>
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
                  Sin métodos para mapear.
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => (
                <tr key={row.provetMethod} className="border-b border-grid-line hover:bg-cool-grey">
                  <td className="truncate px-3 py-2 font-medium text-slate-text" title={row.provetMethod}>
                    {row.provetMethod}
                  </td>
                  <td className="border-l border-grid-line px-3 py-2">
                    <select
                      value={row.siigoPaymentTypeId ?? ""}
                      onChange={(e) =>
                        onSelect(row.provetMethod, e.target.value ? Number(e.target.value) : null)
                      }
                      className="w-full rounded-md border border-grid-line bg-pure-white px-1 py-1 text-xs text-slate-text focus:border-clinical-blue focus:outline-none"
                      aria-label={`Tipo de pago Siigo para ${row.provetMethod}`}
                    >
                      <option value="">— Sin mapear —</option>
                      {selectableTypes.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.name}
                        </option>
                      ))}
                      {/* Keep a stale/inactive selection visible & selected rather than vanishing from the list. */}
                      {row.siigoPaymentTypeId != null && row.siigoPaymentActive === false && (
                        <option value={row.siigoPaymentTypeId}>
                          {row.siigoPaymentTypeName} (inactivo)
                        </option>
                      )}
                    </select>
                  </td>
                  <td className="border-l border-grid-line px-3 py-2 text-muted">
                    {row.siigoPaymentCategory === "CarteraProveedor" ? (
                      <span className="inline-flex items-center gap-1 text-status-draft-text" title="Puede fallar en facturas de venta según la configuración de la cuenta. Prefiera una opción marcada solo 'Cartera'.">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {CATEGORY_LABELS.CarteraProveedor}
                      </span>
                    ) : (
                      row.siigoPaymentCategory ? CATEGORY_LABELS[row.siigoPaymentCategory] ?? row.siigoPaymentCategory : "—"
                    )}
                  </td>
                  <td className="border-l border-grid-line px-3 py-2">
                    {row.mapped && row.siigoPaymentActive === false ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-status-rejected-border bg-status-rejected-bg px-2 py-0.5 text-xs font-semibold text-status-rejected-text" title="Esta forma de pago está inactiva en Siigo Nube. Emitir con ella fallará.">
                        <AlertTriangle className="h-3 w-3" /> Inactivo en Siigo
                      </span>
                    ) : row.mapped ? (
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
        onPageSizeChange={handlePageSizeChange}
      />
    </section>
  );
}