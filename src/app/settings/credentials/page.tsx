"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, AlertTriangle, CheckCircle2, LogOut } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { CredentialsForm } from "@/components/CredentialsForm";
import {
  credentialsSchema,
  parseCredentialsConfig,
  serializeCredentialsConfig,
  stampSendFor,
  type Credentials,
  type CredentialsConfig,
  type EnvironmentMode,
} from "@/mappers/credentials";

const STORAGE_KEY = "fact_vet.credentialsConfig";
const FIELD_KEYS: (keyof Credentials)[] = [
  "partnerId",
  "username",
  "accessKey",
  "clientId",
  "clientSecret",
];

const emptyConfigured = (): Record<string, boolean> =>
  Object.fromEntries(FIELD_KEYS.map((k) => [k, false]));

export default function CredentialsPage() {
  const [mode, setMode] = useState<EnvironmentMode>("sandbox");
  const [configured, setConfigured] = useState<Record<string, boolean>>(emptyConfigured);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [readWarning, setReadWarning] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/emission-mode");
        if (res.status === 503) {
          // Storage read genuinely failed — do NOT treat this as "confirmed
          // sandbox". Fall through to the local cache below and warn.
          setReadWarning(true);
        } else if (res.ok) {
          const parsed = parseCredentialsConfig(JSON.stringify(await res.json()));
          setMode(parsed.mode);
          setConfigured(parsed.configured);
          window.localStorage.setItem(STORAGE_KEY, serializeCredentialsConfig(parsed));
          setLoaded(true);
          return;
        }
      } catch { /* network error → fall back to local cache below */ }
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = parseCredentialsConfig(stored);
          setMode(parsed.mode);
          setConfigured(parsed.configured);
        } catch {
          // corrupt blob → keep seeded sandbox defaults
        }
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(
    (values: Credentials, nextMode: EnvironmentMode) => {
      // Validate formats before recording the configured flags.
      credentialsSchema.parse(values);
      const nextConfigured: Record<string, boolean> = Object.fromEntries(
        FIELD_KEYS.map((k) => [k, values[k].trim().length > 0 || Boolean(configured[k])]),
      );
      const config: CredentialsConfig = {
        mode: nextMode,
        configured: nextConfigured,
        updatedAt: new Date().toISOString(),
      };
      
      window.localStorage.setItem(STORAGE_KEY, serializeCredentialsConfig(config));
      fetch("/api/emission-mode", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: serializeCredentialsConfig(config),
      }).catch(() => { /* offline/network error — local state already updated */ });
      setMode(nextMode);
      setConfigured(nextConfigured);
      setToast(`Credenciales validadas — modo ${nextMode === "production" ? "Producción" : "Sandbox"}`);
      setTimeout(() => setToast(null), 2500);
    },
    [configured],
  );

  // Live credential validation: POSTs values to /api/credentials/health (never persisted).
  const handleTestConnection = useCallback(async (values: Credentials): Promise<boolean> => {
    try {
      const res = await fetch("/api/credentials/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as { ok?: boolean };
      return res.ok && data.ok === true;
    } catch {
      return false;
    }
  }, []);

  const stampSend = stampSendFor(mode);

  return (
    <main className="flex h-screen w-screen flex-col gap-2 overflow-hidden bg-cool-grey p-2">
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-md border border-grid-line bg-pure-white px-2 py-1 text-xs font-semibold text-muted hover:bg-cool-grey"
            aria-label="Volver al panel"
          >
            <ArrowLeft className="h-3 w-3" /> Panel
          </Link>
          <h1 className="text-base font-semibold text-clinical-blue">Credenciales & Modo de Emisión</h1>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold " +
              (stampSend
                ? "border-status-accepted-border bg-status-accepted-bg text-status-accepted-text"
                : "border-status-draft-border bg-status-draft-bg text-status-draft-text")
            }
          >
            stamp.send = {String(stampSend)}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-md border border-grid-line px-2 py-1 text-xs font-semibold text-muted hover:bg-cool-grey"
            >
              <LogOut className="h-3 w-3" /> Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <div className="scrollbar-thin flex h-[calc(100vh-64px)] flex-col gap-2 overflow-y-auto">
        {readWarning && (
          <div className="mx-auto flex w-full max-w-md items-start gap-2 rounded-md border border-status-draft-border bg-status-draft-bg px-3 py-2 text-xs text-status-draft-text">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              No se pudo confirmar el modo de emisión actual en el servidor (almacenamiento no
              disponible). Se está mostrando la última copia guardada en este dispositivo — puede
              no coincidir con lo configurado desde otro equipo. Verifique antes de emitir facturas
              en modo producción.
            </span>
          </div>
        )}
        <section className="mx-auto w-full max-w-md rounded-md border border-grid-line bg-pure-white p-4">
          <p className="mb-3 text-xs text-muted">
            Los valores de las llaves se configuran en <code>.env</code> / capa cifrada (§2.1).
            Este panel valida formato y modo de emisión; no almacena secretos.
          </p>
          {loaded && (
            <CredentialsForm initialMode={mode} configuredMap={configured} onSave={handleSave} onTestConnection={handleTestConnection} />
          )}
        </section>
      </div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md border border-status-accepted-border bg-status-accepted-bg px-3 py-2 text-sm font-semibold text-status-accepted-text">
          <CheckCircle2 className="h-4 w-4 shrink-0" />{toast}
        </div>
      )}
    </main>
  );
}