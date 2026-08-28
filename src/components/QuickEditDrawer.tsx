"use client";

import { type ReactNode, useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import {
  formatCOP,
  formatDate,
  quickEditFormSchema,
  type QuickEditDetail,
  type QuickEditFormValues,
} from "@/mappers/consultationQueue";
import { ReconciliationBar } from "./ReconciliationBar";

interface QuickEditDrawerProps {
  detail: QuickEditDetail | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (values: QuickEditFormValues) => void;
}

const INPUT = "w-full rounded-md border border-grid-line bg-pure-white px-2 py-1 text-sm text-slate-text focus:border-clinical-blue focus:outline-none disabled:opacity-50";
const LABEL = "text-xs font-medium text-muted";
const ERROR = "text-2xs text-status-rejected-text";

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (<div><label className={LABEL}>{label}</label>{children}{error && <p className={ERROR}>{error}</p>}{hint && !error && <p className="text-2xs text-muted">{hint}</p>}</div>);
}

function initialValues(d: QuickEditDetail | null): QuickEditFormValues {
  return { identificationType: d?.identificationType ?? "CC", identificationNumber: d?.identificationNumber ?? "", email: d?.email ?? "", address: d?.address ?? "", paymentMethod: d?.paymentMethod ?? "", paidAmount: d?.total ?? 0 };
}

export function QuickEditDrawer({ detail, isSubmitting, errorMessage, onClose, onSubmit }: QuickEditDrawerProps) {
  const [values, setValues] = useState<QuickEditFormValues>(() => initialValues(detail));
  useEffect(() => { setValues(initialValues(detail)); }, [detail?.id]);
  const update = (patch: Partial<QuickEditFormValues>) => setValues((prev) => ({ ...prev, ...patch }));

  const parsed = quickEditFormSchema.safeParse(values);
  const errors: Record<string, string> = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
  const balanced = (detail?.total ?? 0) - values.paidAmount === 0;
  const canSubmit = parsed.success && balanced && !isSubmitting && detail !== null;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) onClose();
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canSubmit) onSubmit(values);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [canSubmit, isSubmitting, onClose, onSubmit, values]);

  if (detail === null) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onMouseDown={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}>
      <aside className="scrollbar-thin flex h-full w-[480px] max-w-full flex-col overflow-y-auto border-l border-grid-line bg-pure-white">
        <header className="flex items-center justify-between border-b border-grid-line px-4 py-3">
          <h2 className="text-base font-semibold text-slate-text">Edición Rápida · {detail.id}</h2>
          <button type="button" onClick={onClose} disabled={isSubmitting} aria-label="Cerrar" className="rounded-md p-1 text-muted hover:bg-cool-grey disabled:opacity-40"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex-1 space-y-3 p-3">
          <div className="rounded-md border border-grid-line bg-cool-grey p-2 text-xs">
            <div className="text-muted">Paciente</div>
            <div className="font-medium text-slate-text">{detail.patientName}</div>
            <div className="mt-1 text-muted">Fecha</div>
            <div className="font-medium text-slate-text">{formatDate(detail.createdAt)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo ID">
              <select value={values.identificationType} onChange={(e) => update({ identificationType: e.target.value as QuickEditFormValues["identificationType"] })} className={INPUT} disabled={isSubmitting}>
                {["CC", "CE", "NIT", "PA"].map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </Field>
            <Field label="Número / NIT" error={errors.identificationNumber} hint={values.identificationType === "NIT" ? "NIT requiere dígito de verificación (ej. 900123456-1)" : undefined}>
              <input value={values.identificationNumber} onChange={(e) => update({ identificationNumber: e.target.value.replace(/[\s-]/g, "") })} className={INPUT} disabled={isSubmitting} />
            </Field>
          </div>
          <Field label="Correo electrónico" error={errors.email ? "⚠️ Falta correo - Requerido para envío DIAN" : undefined}>
            <input type="email" value={values.email} onChange={(e) => update({ email: e.target.value })} className={INPUT} disabled={isSubmitting} />
          </Field>
          <Field label="Dirección" error={errors.address}>
            <input value={values.address} onChange={(e) => update({ address: e.target.value })} className={INPUT} disabled={isSubmitting} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Método de pago">
              <select value={values.paymentMethod} onChange={(e) => update({ paymentMethod: e.target.value })} className={INPUT} disabled={isSubmitting}>
                {detail.paymentMethodOptions.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </Field>
            <Field label="Monto pagado (COP)">
              <input type="number" min={0} value={values.paidAmount} onChange={(e) => update({ paidAmount: Number(e.target.value) })} className={INPUT} disabled={isSubmitting} />
            </Field>
          </div>
          <ReconciliationBar consultationTotal={detail.total} paidAmount={values.paidAmount} />
          {!balanced && <p className={ERROR}>El total pagado no coincide con el total de la consulta.</p>}
          <div className="rounded-md border border-grid-line">
            <div className="border-b border-grid-line px-2 py-1 text-xs font-semibold text-muted">Ítems</div>
            <table className="w-full text-xs"><tbody>
              {detail.items.map((it) => (<tr key={it.code} className="border-b border-grid-line last:border-0"><td className="px-2 py-1 text-slate-text">{it.name}</td><td className="px-2 py-1 text-right text-muted">x{it.quantity}</td><td className="px-2 py-1 text-right font-medium text-slate-text">{formatCOP(it.lineTotal)}</td></tr>))}
            </tbody></table>
          </div>
          {errorMessage && <div className="flex items-start gap-2 rounded-md border border-status-rejected-border bg-status-rejected-bg px-2 py-2 text-xs text-status-rejected-text"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span>{errorMessage}</span></div>}
        </div>
        <footer className="border-t border-grid-line p-3">
          <button type="button" onClick={() => canSubmit && onSubmit(values)} disabled={!canSubmit} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-clinical-blue px-3 py-2 text-sm font-semibold text-white hover:bg-clinical-blue-hover active:bg-clinical-blue-active disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Emitiendo a DIAN...</>) : "Emitir Factura"}</button>
          <p className="mt-1 text-center text-2xs text-muted">Esc para cerrar · Ctrl+Enter para emitir</p>
        </footer>
      </aside>
    </div>
  );
}

