"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { SiigoDocumentTypeCatalogEntry, SiigoSeller } from "@/schemas/siigo";

interface EmissionSettingsProps {
  documentTypes: SiigoDocumentTypeCatalogEntry[];
  sellers: SiigoSeller[];
  documentTypeId: number | null;
  creditNoteDocumentTypeId: number | null;
  sellerId: number | null;
  onDocumentTypeChange: (id: number | null) => void;
  onCreditNoteDocumentTypeChange: (id: number | null) => void;
  onSellerChange: (id: number | null) => void;
}

/** Single labeled select for a required Siigo emission setting, with a status pill. */
function SettingSelect({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | null;
  options: { id: number; label: string; disabled?: boolean }[];
  onChange: (id: number | null) => void;
}) {
  const configured = value !== null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-text">{label}</label>
        {configured ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-status-accepted-border bg-status-accepted-bg px-2 py-0.5 text-[11px] font-semibold text-status-accepted-text">
            <CheckCircle2 className="h-3 w-3" /> Configurado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-status-draft-border bg-status-draft-bg px-2 py-0.5 text-[11px] font-semibold text-status-draft-text">
            <AlertTriangle className="h-3 w-3" /> Sin configurar
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted">{hint}</p>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded-md border border-grid-line bg-pure-white px-2 py-1.5 text-sm text-slate-text focus:border-clinical-blue focus:outline-none"
        aria-label={label}
      >
        <option value="">— Seleccione —</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function EmissionSettings({
  documentTypes,
  sellers,
  documentTypeId,
  creditNoteDocumentTypeId,
  sellerId,
  onDocumentTypeChange,
  onCreditNoteDocumentTypeChange,
  onSellerChange,
}: EmissionSettingsProps) {
  const fvTypes = documentTypes.filter((d) => d.type === "FV");
  const ncTypes = documentTypes.filter((d) => d.type === "NC");
  const allConfigured = documentTypeId !== null && creditNoteDocumentTypeId !== null && sellerId !== null;

  return (
    <section className="flex flex-col gap-3 rounded-md border border-grid-line bg-pure-white p-3">
      <div className="flex items-center justify-between border-b border-grid-line pb-2">
        <h2 className="text-base font-semibold text-slate-text">Configuración de Emisión</h2>
        {!allConfigured && (
          <span className="text-[11px] font-semibold text-status-draft-text">
            Requerido antes de facturar o anular
          </span>
        )}
      </div>
      {documentTypes.length === 0 && sellers.length === 0 ? (
        <p className="text-xs text-muted">
          Sincronice catálogos arriba para ver los tipos de comprobante y vendedores reales de su cuenta Siigo.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SettingSelect
            label="Tipo de comprobante — Factura de Venta (FV)"
            hint="Usado en cada factura emitida. Debe existir y estar activo en Siigo Nube."
            value={documentTypeId}
            options={fvTypes.map((d) => ({ id: d.id, label: `${d.name} (${d.code})`, disabled: !d.active }))}
            onChange={onDocumentTypeChange}
          />
          <SettingSelect
            label="Tipo de comprobante — Nota Crédito (NC)"
            hint="Usado al anular una factura aceptada por la DIAN."
            value={creditNoteDocumentTypeId}
            options={ncTypes.map((d) => ({ id: d.id, label: `${d.name} (${d.code})`, disabled: !d.active }))}
            onChange={onCreditNoteDocumentTypeChange}
          />
          <SettingSelect
            label="Vendedor (Siigo)"
            hint="Vendedor asociado a cada factura emitida desde esta app."
            value={sellerId}
            options={sellers.map((s) => ({ id: s.id, label: `${s.first_name} ${s.last_name}`.trim(), disabled: !s.active }))}
            onChange={onSellerChange}
          />
        </div>
      )}
    </section>
  );
}