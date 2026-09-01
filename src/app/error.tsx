"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Unhandled route error:", error);
  }, [error]);

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-cool-grey p-4">
      <section className="w-full max-w-sm rounded-md border border-grid-line bg-pure-white p-5 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-status-rejected-border bg-status-rejected-bg">
          <AlertTriangle className="h-5 w-5 text-status-rejected-text" />
        </div>
        <h1 className="mb-1 text-base font-semibold text-slate-text">
          Estamos teniendo un problema
        </h1>
        <p className="mb-4 text-xs text-muted">
          Algo falló al cargar esta pantalla. Sus datos y facturas ya emitidas están a salvo —
          intente de nuevo o vuelva al panel principal.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-clinical-blue px-3 py-2 text-sm font-semibold text-white hover:bg-clinical-blue-hover active:bg-clinical-blue-active"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Intentar de nuevo
          </button>
          <a
            href="/"
            className="inline-flex flex-1 items-center justify-center rounded-md border border-grid-line px-3 py-2 text-sm font-semibold text-muted hover:bg-cool-grey"
          >
            Ir al panel
          </a>
        </div>
        {error.digest && (
          <p className="mt-3 text-2xs text-muted">
            Código de referencia: <span className="font-mono">{error.digest}</span> — mencione este
            código si contacta soporte técnico.
          </p>
        )}
      </section>
    </main>
  );
}