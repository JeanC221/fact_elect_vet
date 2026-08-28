"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { ANNULMENT_REASONS, type AnnulmentReason } from "@/mappers/creditNote";
import { formatCOP } from "@/mappers/consultationQueue";
import type { InvoiceHistoryRow } from "@/mappers/invoiceHistory";

interface CreditNoteModalProps {
  row: InvoiceHistoryRow | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onConfirm: (reason: AnnulmentReason) => void;
}

const SELECT =
  "mt-1 w-full rounded-md border border-grid-line bg-pure-white px-2 py-1 text-sm text-slate-text focus:border-clinical-blue focus:outline-none disabled:opacity-50";

export function CreditNoteModal({
  row,
  isSubmitting,
  errorMessage,
  onClose,
  onConfirm,
}: CreditNoteModalProps) {
  const [reason, setReason] = useState<AnnulmentReason>("billing_error");

  useEffect(() => {
    if (row) setReason("billing_error");
  }, [row?.invoiceId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) onClose();
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && row) onConfirm(reason);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isSubmitting, onClose, onConfirm, reason, row]);

  if (row === null) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="flex w-[420px] max-w-full flex-col rounded-md border border-grid-line bg-pure-white">
        <header className="flex items-center justify-between border-b border-grid-line px-4 py-3">
          <h2 className="text-base font-semibold text-slate-text">Anular Factura · {row.invoiceId}</h2>
          <button type="button" onClick={onClose} disabled={isSubmitting} aria-label="Cerrar" className="rounded-md p-1 text-muted hover:bg-cool-grey disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-3 p-4">
          <div className="rounded-md border border-grid-line bg-cool-grey p-2 text-xs">
            <div className="text-muted">Cliente</div>
            <div className="font-medium text-slate-text">{row.clientName}</div>
            <div className="mt-1 text-muted">Total original</div>
            <div className="font-medium text-slate-text">{formatCOP(row.total)}</div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Motivo de anulación</label>
            <select value={reason} onChange={(e) => setReason(e.target.value as AnnulmentReason)} className={SELECT} disabled={isSubmitting}>
              {ANNULMENT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-status-draft-border bg-status-draft-bg px-2 py-2 text-xs text-status-draft-text">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>Esta acción genera una nota crédito en Siigo y anula la factura ante la DIAN. No es reversible.</span>
          </div>
          {errorMessage && (
            <div className="flex items-start gap-2 rounded-md border border-status-rejected-border bg-status-rejected-bg px-2 py-2 text-xs text-status-rejected-text">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
        <footer className="flex gap-2 border-t border-grid-line p-3">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="flex-1 rounded-md border border-grid-line px-3 py-2 text-sm font-semibold text-muted hover:bg-cool-grey disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={() => onConfirm(reason)} disabled={isSubmitting} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-clinical-blue px-3 py-2 text-sm font-semibold text-white hover:bg-clinical-blue-hover active:bg-clinical-blue-active disabled:cursor-not-allowed disabled:opacity-50">
            {isSubmitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Anulando...</>) : "Anular Factura"}
          </button>
        </footer>
        <p className="px-3 pb-2 text-center text-2xs text-muted">Esc para cerrar · Ctrl+Enter para anular</p>
      </div>
    </div>
  );
}
