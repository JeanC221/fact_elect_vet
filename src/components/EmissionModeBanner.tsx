"use client";

import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { EMISSION_GATE_MESSAGES, type EmissionGate } from "@/mappers/emissionModeState";

interface EmissionModeBannerProps {
  gate: EmissionGate;
  isRetrying?: boolean;
  onRetry?: () => void;
}

/**
 * Presentational notice for the emission-mode gate. Renders nothing when the
 * mode is confirmed, so the normal path is unchanged for the operator.
 *
 * Follows the same shape as the `missingSiigoSettings` notice already in
 * QuickEditDrawer: status-token palette, `rounded-md`, `p-2`, AlertTriangle.
 * All copy comes from the pure mapper — this component maps nothing.
 */
export function EmissionModeBanner({ gate, isRetrying = false, onRetry }: EmissionModeBannerProps) {
  const message = EMISSION_GATE_MESSAGES[gate.reason];
  if (!message) return null;

  const blocking = !gate.canEmit && gate.reason !== "loading";
  const tone = blocking
    ? "border-status-rejected-border bg-status-rejected-bg text-status-rejected-text"
    : "border-status-draft-border bg-status-draft-bg text-status-draft-text";

  return (
    <div className={`flex items-start gap-2 rounded-md border px-2 py-2 text-xs ${tone}`}>
      {gate.reason === "loading" ? (
        <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" />
      ) : (
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      )}
      <div className="flex flex-1 flex-col gap-1">
        <span>{message}</span>
        {gate.reason !== "loading" && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="inline-flex w-fit items-center gap-1 rounded-md border border-grid-line bg-pure-white px-2 py-1 text-2xs font-semibold text-clinical-blue hover:bg-cool-grey disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`} />
            {isRetrying ? "Consultando…" : "Reintentar"}
          </button>
        )}
      </div>
    </div>
  );
}
