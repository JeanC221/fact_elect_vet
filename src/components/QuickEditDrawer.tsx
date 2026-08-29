"use client";

import { type ReactNode, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, X } from "lucide-react";
import {
  formatCOP,
  formatDate,
  quickEditFormSchema,
  type QuickEditDetail,
  type QuickEditFormValues,
} from "@/mappers/consultationQueue";
import { toCents } from "@/schemas/provet";
import { ReconciliationBar } from "./ReconciliationBar";

interface QuickEditDrawerProps {
  detail: QuickEditDetail | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  errorDetail?: string | null;
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
  return { name: d?.clientName ?? "", identificationType: d?.identificationType ?? "CC", identificationNumber: d?.identificationNumber ?? "", email: d?.email ?? "", phone: d?.phone ?? "", paymentMethod: d?.paymentMethod ?? "", paidAmount: d?.total ?? 0 };
}

export function QuickEditDrawer({ detail, isSubmitting, errorMessage, errorDetail, onClose, onSubmit }: QuickEditDrawerProps) {
  const [values, setValues] = useState<QuickEditFormValues>(() => initialValues(detail));
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  useEffect(() => { setValues(initialValues(detail)); setIsEditingAmount(false); }, [detail?.id]);
  const update = (patch: Partial<QuickEditFormValues>) => setValues((prev) => ({ ...prev, ...patch }));

  const parsed = quickEditFormSchema.safeParse(values);
  const errors: Record<string, string> = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
  const balanced = toCents(detail?.total ?? 0) - toCents(values.paidAmount) === 0;
  const canSubmit = parsed.success && balanced && !isSubmitting && detail !== null && values.paymentMethod !== "";

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
          <Field label="Nombre del Cliente" error={errors.name}>
            <input value={values.name} onChange={(e) => update({ name: e.target.value })} className={INPUT} disabled={isSubmitting} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo ID">
              <select value={values.identificationType} onChange={(e) => update({ identificationType: e.target.value as QuickEditFormValues["identificationType"] })} className={INPUT} disabled={isSubmitting}>
                {["CC", "CE", "NIT", "PA"].map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </Field>
            <Field label="Número / NIT" error={errors.identificationNumber} hint={values.identificationType === "CC" ? "Cédula válida: 6–10 dígitos" : values.identificationType === "NIT" ? "NIT requiere dígito de verificación (ej. 900123456-1)" : undefined}>
              <input value={values.identificationNumber} onChange={(e) => update({ identificationNumber: e.target.value.replace(/[.\s]/g, "") })} className={INPUT} disabled={isSubmitting} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Correo electrónico" error={errors.email ? (values.email.trim() ? errors.email : "Falta correo") : undefined}>
              <input type="email" value={values.email} onChange={(e) => update({ email: e.target.value })} className={INPUT} disabled={isSubmitting} />
            </Field>
            <Field label="Teléfono" error={errors.phone ? (values.phone.length < 7 ? "Mínimo 7 dígitos" : errors.phone) : undefined}>
              <input value={values.phone} onChange={(e) => update({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} className={INPUT} disabled={isSubmitting} placeholder="Ej. 3105550101" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Método de pago">
              <select value={values.paymentMethod} onChange={(e) => update({ paymentMethod: e.target.value })} className={INPUT} disabled={isSubmitting}>
                <option value="">Seleccionar Medio de Pago</option>
                {detail.paymentMethodOptions.map((m) => (<option key={m.provetMethod} value={m.provetMethod}>{m.provetMethod}</option>))}
              </select>
            </Field>
            <Field label="Monto pagado (COP)">
              {isEditingAmount ? (
                <div className="flex items-center gap-1">
                  <input type="number" min={0} step="0.01" value={values.paidAmount} onChange={(e) => update({ paidAmount: Math.round(Number(e.target.value) * 100) / 100 })} className={INPUT} disabled={isSubmitting} />
                  <button type="button" onClick={() => setIsEditingAmount(false)} disabled={isSubmitting} className="shrink-0 rounded p-0.5 text-status-accepted-text hover:bg-cool-grey disabled:opacity-40" aria-label="Confirmar monto pagado">
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${balanced ? "text-slate-text" : "text-status-rejected-text"}`}>
                    {formatCOP(values.paidAmount)} COP
                  </span>
                  <button type="button" onClick={() => setIsEditingAmount((prev) => !prev)} disabled={isSubmitting} className="rounded p-0.5 text-muted hover:bg-cool-grey hover:text-clinical-blue disabled:opacity-40" aria-label="Editar monto pagado">
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              )}
            </Field>
          </div>
          {isEditingAmount && <ReconciliationBar consultationTotal={detail.total} paidAmount={values.paidAmount} />}
          {isEditingAmount && !balanced && <p className={ERROR}>El total pagado no coincide con el total de la consulta.</p>}
          <div className="rounded-md border border-grid-line">
            <div className="border-b border-grid-line px-2 py-1 text-xs font-semibold text-muted">Ítems</div>
            <table className="w-full text-xs"><tbody>
              {detail.items.map((it) => (<tr key={it.code} className="border-b border-grid-line last:border-0"><td className="px-2 py-1 text-slate-text">{it.name}</td><td className="px-2 py-1 text-right text-muted">x{it.quantity}</td><td className="px-2 py-1 text-right font-medium text-slate-text">{formatCOP(it.lineTotal)}</td></tr>))}
            </tbody></table>
          </div>
          {errorMessage && <div className="flex items-start gap-2 rounded-md border border-status-rejected-border bg-status-rejected-bg px-2 py-2 text-xs text-status-rejected-text"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /><span>{errorDetail ?? errorMessage}</span></div>}
        </div>
        <footer className="border-t border-grid-line p-3">
          <button type="button" onClick={() => canSubmit && onSubmit(values)} disabled={!canSubmit} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-clinical-blue px-3 py-2 text-sm font-semibold text-white hover:bg-clinical-blue-hover active:bg-clinical-blue-active disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Emitiendo a DIAN...</>) : "⚡ Emitir Factura"}</button>
          <p className="mt-1 text-center text-2xs text-muted">Esc para cerrar · Ctrl+Enter para emitir</p>
        </footer>
      </aside>
    </div>
  );
}

