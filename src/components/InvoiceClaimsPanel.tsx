"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Unlock } from "lucide-react";
import {
  parseClaimsResponse,
  claimStatusPresentation,
  formatClaimAge,
  releaseConfirmationMessage,
  interpretReleaseResponse,
  type InvoiceClaimWire,
} from "@/mappers/invoiceClaimsAdmin";
import { apiRequest } from "@/services/apiClient";

/**
 * Admin-only safety net for consultations wedged by a claim.
 *
 * Deliberately minimal: with automatic reconciliation in place, blocked
 * emissions went from roughly one in ten to a rare event, so this is a rescue
 * tool rather than a daily-use screen. It exists because the alternative was
 * hand-written SQL against production — which bypasses the server's refusal to
 * release an `emitted` claim and has already caused a real incident.
 *
 * All decisions (parsing, wording, status handling) live in
 * `@/mappers/invoiceClaimsAdmin`; this file only renders and calls fetch.
 * Access is enforced server-side by ADMIN_ONLY_RULES in proxy.ts, not
 * by hiding this component.
 */

const PILL_TONE: Record<"warning" | "danger" | "neutral", string> = {
  warning: "border-status-draft-border bg-status-draft-bg text-status-draft-text",
  danger: "border-status-rejected-border bg-status-rejected-bg text-status-rejected-text",
  neutral: "border-grid-line bg-cool-grey text-muted",
};

type Banner = { tone: "ok" | "warn" | "bad"; text: string } | null;

const BANNER_TONE: Record<"ok" | "warn" | "bad", string> = {
  ok: "border-status-accepted-border bg-status-accepted-bg text-status-accepted-text",
  warn: "border-status-draft-border bg-status-draft-bg text-status-draft-text",
  bad: "border-status-rejected-border bg-status-rejected-bg text-status-rejected-text",
};

export function InvoiceClaimsPanel() {
  const [claims, setClaims] = useState<InvoiceClaimWire[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { ok, status, data } = await apiRequest("/api/invoice-claims", { cache: "no-store" });
      if (!ok) {
        setClaims(null);
        setLoadError(
          status === 403
            ? "Se requiere rol de administrador para ver las emisiones bloqueadas."
            : "No se pudo consultar las emisiones bloqueadas. La lista mostrada puede no estar completa.",
        );
        return;
      }
      const parsed = parseClaimsResponse(data);
      if (parsed === null) {
        setClaims(null);
        setLoadError("El servidor devolvió una respuesta inesperada. No se muestra la lista para no dar una falsa tranquilidad.");
        return;
      }
      setClaims(parsed);
    } catch {
      setClaims(null);
      setLoadError("Error de red al consultar las emisiones bloqueadas.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRelease = useCallback(
    async (consultationId: string) => {
      setConfirmingId(null);
      setReleasingId(consultationId);
      setBanner(null);
      try {
        const { status, data } = await apiRequest(`/api/invoice-claims?consultationId=${encodeURIComponent(consultationId)}`, {
          method: "DELETE",
        });
        const outcome = interpretReleaseResponse(status, data, consultationId);
        setBanner({
          tone: outcome.kind === "released" ? "ok" : outcome.kind === "blocked" ? "warn" : "bad",
          text: outcome.message,
        });
        // Reload on `blocked` too: a 409 means the claim turned `emitted`
        // between the list load and this click, and `listOpenClaims` filters
        // `emitted` out — so the row on screen no longer exists server-side.
        if (outcome.kind !== "error") await load();
      } catch {
        setBanner({ tone: "bad", text: "Error de red al desbloquear la consulta. No se liberó nada." });
      } finally {
        setReleasingId(null);
      }
    },
    [load],
  );

  return (
    <section className="flex w-full max-w-md flex-col gap-3 rounded-md border border-grid-line bg-pure-white p-3">
      <div className="flex items-center justify-between border-b border-grid-line pb-2">
        <h2 className="text-base font-semibold text-slate-text">Emisiones bloqueadas</h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={isLoading}
          className="inline-flex items-center gap-1 rounded-md border border-grid-line px-2 py-1 text-[11px] font-semibold text-slate-text hover:bg-cool-grey disabled:opacity-50"
          aria-label="Actualizar la lista de emisiones bloqueadas"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      <p className="text-[11px] text-muted">
        Consultas que quedaron bloqueadas tras un fallo de emisión. Desbloquear permite volver a facturarlas.
        Es una herramienta de rescate: normalmente esta lista está vacía.
      </p>

      {banner && (
        <div className={`flex items-start gap-2 rounded-md border p-2 text-xs ${BANNER_TONE[banner.tone]}`} role="status">
          {banner.tone === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {loadError && (
        <div className="flex items-start gap-2 rounded-md border border-status-rejected-border bg-status-rejected-bg p-2 text-xs text-status-rejected-text" role="alert">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {isLoading && claims === null && !loadError && (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3 w-3 animate-spin" /> Consultando…
        </div>
      )}

      {claims !== null && claims.length === 0 && (
        <p className="rounded-md border border-status-accepted-border bg-status-accepted-bg px-2 py-1.5 text-xs text-status-accepted-text">
          No hay ninguna consulta bloqueada.
        </p>
      )}

      {claims !== null && claims.length > 0 && (
        <ul className="flex flex-col gap-2">
          {claims.map((c) => {
            const presentation = claimStatusPresentation(c.status);
            const isConfirming = confirmingId === c.consultationId;
            const isReleasing = releasingId === c.consultationId;
            return (
              <li key={c.consultationId} className="flex flex-col gap-1 rounded-md border border-grid-line p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-slate-text" title={c.consultationId}>
                    {c.consultationId}
                  </span>
                  <span className={`shrink-0 rounded-md border px-2 py-0.5 text-2xs font-semibold ${PILL_TONE[presentation.tone]}`}>
                    {presentation.label}
                  </span>
                </div>

                <p className="text-2xs text-muted">
                  Bloqueada {formatClaimAge(c.claimedAt)}
                  {c.invoiceId ? ` · Factura ${c.invoiceId}` : ""}
                </p>
                <p className="text-2xs text-muted">{presentation.hint}</p>
                {c.lastError && (
                  <p className="truncate text-2xs text-status-rejected-text" title={c.lastError}>
                    Último error: {c.lastError}
                  </p>
                )}

                {presentation.releasable && !isConfirming && (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(c.consultationId)}
                    disabled={isReleasing}
                    className="mt-1 inline-flex items-center justify-center gap-1 self-start rounded-md border border-grid-line px-2 py-1 text-[11px] font-semibold text-slate-text hover:bg-cool-grey disabled:opacity-50"
                  >
                    {isReleasing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
                    Desbloquear
                  </button>
                )}

                {isConfirming && (
                  <div className="mt-1 flex flex-col gap-2 rounded-md border border-status-draft-border bg-status-draft-bg p-2">
                    <p className="text-2xs text-status-draft-text">{releaseConfirmationMessage(c.consultationId)}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRelease(c.consultationId)}
                        className="inline-flex items-center gap-1 rounded-md bg-clinical-blue px-2 py-1 text-[11px] font-semibold text-pure-white hover:bg-clinical-blue-hover"
                      >
                        <Unlock className="h-3 w-3" /> Sí, ya verifiqué en Siigo
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="rounded-md border border-grid-line bg-pure-white px-2 py-1 text-[11px] font-semibold text-slate-text hover:bg-cool-grey"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
