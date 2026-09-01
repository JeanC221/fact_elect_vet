"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Unhandled root layout error:", error);
  }, [error]);

  return (
    <html lang="es-CO">
      <body
        style={{
          margin: 0,
          height: "100vh",
          width: "100vw",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F4F6F8",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: 16,
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: 380,
            borderRadius: 6,
            border: "1px solid #E2E8F0",
            backgroundColor: "#FFFFFF",
            padding: 20,
            textAlign: "center",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              margin: "0 auto 12px",
              display: "flex",
              height: 40,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 6,
              border: "1px solid #F5C2C7",
              backgroundColor: "#F8D7DA",
              fontSize: 20,
            }}
            aria-hidden
          >
            ⚠️
          </div>
          <h1 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#1A202C" }}>
            En este momento estamos teniendo problemas
          </h1>
          <p style={{ margin: "0 0 16px", fontSize: 12, color: "#5A6A85", lineHeight: 1.5 }}>
            La aplicación no pudo cargar. Sus facturas ya emitidas y su historial no se ven
            afectados — intente recargar la página en unos segundos.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              width: "100%",
              borderRadius: 6,
              border: "none",
              backgroundColor: "#0052CC",
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: 600,
              padding: "10px 12px",
              cursor: "pointer",
            }}
          >
            Recargar
          </button>
          {error.digest && (
            <p style={{ margin: "12px 0 0", fontSize: 10, color: "#5A6A85" }}>
              Código de referencia: <span style={{ fontFamily: "monospace" }}>{error.digest}</span>{" "}
              — mencione este código si contacta soporte técnico.
            </p>
          )}
        </section>
      </body>
    </html>
  );
}