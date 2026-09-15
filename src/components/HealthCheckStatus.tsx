"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, RefreshCw } from "lucide-react";
import { healthReportSchema, type HealthReport, type ServiceState } from "@/schemas/health";
import { apiRequest } from "@/services/apiClient";

const REFRESH_MS = 60_000;

const STATE_STYLE: Record<ServiceState, { dot: string; text: string; border: string; Icon: typeof CheckCircle2 }> = {
  online: { dot: "bg-status-accepted-border", text: "text-status-accepted-text", border: "border-status-accepted-border", Icon: CheckCircle2 },
  degraded: { dot: "bg-status-draft-border", text: "text-status-draft-text", border: "border-status-draft-border", Icon: Clock },
  offline: { dot: "bg-status-rejected-border", text: "text-status-rejected-text", border: "border-status-rejected-border", Icon: AlertTriangle },
  unknown: { dot: "bg-muted", text: "text-muted", border: "border-grid-line", Icon: HelpCircle },
};

/** Fetch the same-origin health endpoint and validate with Zod. */
async function fetchHealth(): Promise<HealthReport> {
  const { ok, data } = await apiRequest("/api/health", { cache: "no-store" });
  if (!ok) throw new Error("health");
  return healthReportSchema.parse(data);
}

/**
 * Real-time "Service Semaphore" for Provet Cloud, Siigo Nube and DIAN.
 * Polls the dedicated /api/health endpoint (never external APIs directly),
 * renders a clinical status card with a manual refresh + 60s auto-refresh.
 */
export function HealthCheckStatus() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(false);
    setIsConnected(false);
    try {
      setReport(await fetchHealth());
      setIsConnected(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
    timer.current = setInterval(run, REFRESH_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [run]);

  return (
    <section className="w-full max-w-md rounded-md border border-grid-line bg-pure-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-clinical-blue">Estado de Servicios</h2>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-grid-line px-2 py-1 text-xs font-semibold text-muted hover:bg-cool-grey disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </header>

      {isConnected ? (
        <div
          className={`mb-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${STATE_STYLE.online.border} ${STATE_STYLE.online.text}`}
        >
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATE_STYLE.online.dot}`} />
          <CheckCircle2 className="mr-1 inline h-4 w-4" />
          Sistema de monitoreo activo
        </div>
      ) : error && (
        <p className="mb-3 flex items-center gap-1 text-xs text-status-rejected-text">
          <AlertTriangle className="h-3 w-3" />
          No se pudo obtener el estado de los servicios. Reintente.
        </p>
      )}

      <ul className="divide-y divide-grid-line">
        {loading && !report
          ? Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="flex items-center gap-2 py-2 px-1">
                <span className="h-2.5 w-2.5 rounded-full bg-grid-line" />
                <span className="h-3 w-24 rounded-sm bg-cool-grey" />
                <span className="ml-auto h-3 w-16 rounded-sm bg-cool-grey" />
              </li>
            ))
          : report?.services.map((s) => {
              const { dot, text, Icon = HelpCircle } = STATE_STYLE[s.state] ?? STATE_STYLE.unknown;
              return (
                <li key={s.name} className="flex items-center gap-2 py-2 px-1">
                  <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-text">{s.label}</p>
                    <p className={`truncate text-xs ${text}`}>
                      <Icon className="mr-1 inline h-3 w-3" />
                      {s.detail}
                    </p>
                  </div>
                  <span className="text-xs text-muted">
                    {s.latencyMs != null ? `${s.latencyMs} ms` : "—"}
                  </span>
                </li>
              );
            })}
      </ul>
    </section>
  );
}
