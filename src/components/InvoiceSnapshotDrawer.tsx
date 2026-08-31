"use client";

import { X } from "lucide-react";
import { formatCOP } from "@/mappers/consultationQueue";
import type { InvoiceHistoryRow } from "@/mappers/invoiceHistory";

interface InvoiceSnapshotDrawerProps {
  row: InvoiceHistoryRow | null;
  onClose: () => void;
}

const FIELD = "text-xs";
const LABEL = "text-2xs font-medium text-muted";
const VALUE = "mt-0.5 rounded-md border border-grid-line bg-cool-grey px-2 py-1 text-slate-text";

export function InvoiceSnapshotDrawer({ row, onClose }: InvoiceSnapshotDrawerProps) {
  if (row === null) return null;
  const s = row.formSnapshot;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="scrollbar-thin flex h-full w-[480px] max-w-full flex-col overflow-y-auto border-l border-grid-line bg-pure-white">
        <header className="flex items-center justify-between border-b border-grid-line px-4 py-3">
          <h2 className="text-base font-semibold text-slate-text">Datos enviados · {row.invoiceNumber ?? row.invoiceId}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-muted hover:bg-cool-grey">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-3 p-3">
          {!s ? (
            <div className="rounded-md border border-grid-line bg-cool-grey p-2 text-xs text-muted">
              Esta factura fue emitida antes de que la app empezara a guardar el detalle exacto del formulario. Solo se conserva lo mostrado en la tabla del historial.
            </div>
          ) : (
            <>
              <p className="text-2xs text-muted">
                Datos enviados en facturación. Estos valores se enviaron a DIAN y no pueden modificarse; si hay errores, genere una nota crédito y vuelva a facturar.
              </p>
              <div className={FIELD}>
                <div className={LABEL}>Nombre del Cliente</div>
                <div className={VALUE}>{s.name}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={FIELD}>
                  <div className={LABEL}>Tipo ID</div>
                  <div className={VALUE}>{s.identificationType}</div>
                </div>
                <div className={FIELD}>
                  <div className={LABEL}>Número / NIT</div>
                  <div className={VALUE}>{s.identificationNumber}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={FIELD}>
                  <div className={LABEL}>Correo electrónico</div>
                  <div className={VALUE}>{s.email}</div>
                </div>
                <div className={FIELD}>
                  <div className={LABEL}>Teléfono</div>
                  <div className={VALUE}>{s.phone}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={FIELD}>
                  <div className={LABEL}>Método de pago</div>
                  <div className={VALUE}>{s.paymentMethod}</div>
                </div>
                <div className={FIELD}>
                  <div className={LABEL}>Monto pagado (COP)</div>
                  <div className={VALUE}>{formatCOP(s.paidAmount)} COP</div>
                </div>
              </div>
            </>
          )}
          <div className={FIELD}>
            <div className={LABEL}>CUFE</div>
            <div className={VALUE}>{row.cufe || "— (sin timbrar)"}</div>
          </div>
        </div>
      </aside>
    </div>
  );
}