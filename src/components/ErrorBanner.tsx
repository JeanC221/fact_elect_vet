"use client";

import { AlertTriangle, CheckCircle2, RefreshCw, X } from "lucide-react";
import type {
  QuickAction,
  TranslatedError,
} from "@/services/errorTranslator";

interface ErrorBannerProps {
  error: TranslatedError | null;
  retryAttempt: number;
  maxRetries: number;
  onQuickAction: (action: QuickAction) => void;
  onDismiss: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  edit_identification: "Editar ID",
  edit_payments: "Ajustar montos",
  edit_email: "Completar campos",
};

const BASE = "flex items-start gap-2 rounded-md border px-2 py-2 text-xs";
const STYLES = {
  error:
    "border-status-rejected-border bg-status-rejected-bg text-status-rejected-text",
  warning:
    "border-status-draft-border bg-status-draft-bg text-status-draft-text",
  success:
    "border-status-accepted-border bg-status-accepted-bg text-status-accepted-text",
} as const;

export function ErrorBanner({
  error,
  retryAttempt,
  maxRetries,
  onQuickAction,
  onDismiss,
}: ErrorBannerProps) {
  if (!error && retryAttempt === 0) return null;

  if (retryAttempt > 0) {
    return (
      <div className={`${BASE} ${STYLES.warning}`}>
        <RefreshCw className="mt-0.5 h-3 w-3 shrink-0 animate-spin" />
        <span className="flex-1">Servidor de facturación ocupado.</span>
        <span className="font-semibold">
          Reintentando ({retryAttempt}/{maxRetries})…
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar"
          className="rounded-md p-0.5 hover:opacity-70"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  if (!error) return null;

  const isDraftSuccess = error.quickAction === "save_draft";
  const Icon = isDraftSuccess ? CheckCircle2 : error.severity === "warning" ? RefreshCw : AlertTriangle;
  const label = ACTION_LABELS[error.quickAction];

  return (
    <div className={`${BASE} ${isDraftSuccess ? STYLES.success : STYLES[error.severity]}`}>
      <Icon className="mt-0.5 h-3 w-3 shrink-0" />
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <span className="flex-1">
          {error.message}
          {error.detail && (
          <span className="block text-[11px] opacity-75">{error.detail}</span>
         )}
        </span>
        {label && (
          <button
            type="button"
            onClick={() => onQuickAction(error.quickAction)}
            className="rounded-md border border-current px-2 py-0.5 font-semibold hover:opacity-80"
          >
            {label}
          </button>
        )}
        {error.quickAction === "save_draft" && (
          <span className="font-semibold">Borrador en cola</span>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar"
        className="rounded-md p-0.5 hover:opacity-70"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}