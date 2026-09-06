import { z } from "zod";

/**
 * Pure layer behind the admin "Emisiones bloqueadas" panel.
 *
 * The component that renders this is a thin `.tsx`; everything decidable —
 * response parsing, status wording, and how each API failure is explained to
 * the admin — lives here so it is covered by the node-environment Vitest suite
 * (this repo has no jsdom/RTL, by convention: see the Task 5.1 note in
 * PROJECT_STATE.md).
 *
 * Why the panel exists at all: releasing a claim is the only way to unwedge a
 * consultation left `pending` by a dead lambda or `unknown` by a timeout, and
 * until now the only route to that was hand-written SQL against production.
 * SQL bypasses the one protection that matters — DELETE refuses to release an
 * `emitted` claim, because releasing it lets a second document be stamped at
 * the DIAN for an invoice that demonstrably exists. That has already happened
 * once on this project.
 */

/** Wire shape of GET /api/invoice-claims (claimedAt arrives as an ISO string). */
export const invoiceClaimWireSchema = z.object({
  consultationId: z.string().min(1),
  status: z.enum(["pending", "emitted", "unknown", "annulled"]),
  invoiceId: z.string().nullable(),
  claimedAt: z.string().min(1),
  lastError: z.string().nullable(),
});

export const invoiceClaimsResponseSchema = z.object({
  claims: z.array(invoiceClaimWireSchema),
  count: z.number().int().nonnegative(),
});

export type InvoiceClaimWire = z.infer<typeof invoiceClaimWireSchema>;
export type InvoiceClaimStatusWire = InvoiceClaimWire["status"];

/** Spanish label + severity tone for each claim state, for the status pill. */
export interface ClaimStatusPresentation {
  label: string;
  tone: "warning" | "danger" | "neutral";
  /** Whether the admin may attempt to release this claim from the UI. */
  releasable: boolean;
  hint: string;
}

const STATUS_PRESENTATION: Record<InvoiceClaimStatusWire, ClaimStatusPresentation> = {
  pending: {
    label: "En curso",
    tone: "warning",
    releasable: true,
    hint: "La emisión quedó en curso. Si ningún dispositivo está facturando esta consulta, el proceso murió a mitad de camino.",
  },
  unknown: {
    label: "Resultado desconocido",
    tone: "danger",
    releasable: true,
    hint: "Siigo falló de forma ambigua (timeout o 5xx). No hay prueba de que la factura NO se haya creado.",
  },
  emitted: {
    label: "Ya facturada",
    tone: "neutral",
    releasable: false,
    hint: "Esta consulta ya tiene factura. Para volver a facturarla, anúlela con una nota crédito.",
  },
  annulled: {
    label: "Anulada",
    tone: "neutral",
    releasable: false,
    hint: "La factura fue anulada con una nota crédito; la consulta ya puede volver a facturarse.",
  },
};

export function claimStatusPresentation(status: InvoiceClaimStatusWire): ClaimStatusPresentation {
  return STATUS_PRESENTATION[status];
}

/**
 * Parse a GET /api/invoice-claims body.
 *
 * Returns null rather than throwing so the component can show "no se pudo
 * leer la lista" instead of rendering a partially-trusted table. An empty
 * `claims` array and an unreadable response must never look the same to the
 * admin — the caller distinguishes them by null vs [].
 */
export function parseClaimsResponse(raw: unknown): InvoiceClaimWire[] | null {
  const parsed = invoiceClaimsResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data.claims : null;
}

/** Human-readable claim age, so an admin can tell a live emission from a wedged one. */
export function formatClaimAge(claimedAt: string, now: Date = new Date()): string {
  const then = new Date(claimedAt);
  if (Number.isNaN(then.getTime())) return "fecha desconocida";
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (minutes < 0) return "hace un momento";
  if (minutes < 1) return "hace menos de un minuto";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

/** Confirmation text shown before a release. Names the consultation explicitly. */
export function releaseConfirmationMessage(consultationId: string): string {
  return (
    `Va a desbloquear la consulta ${consultationId}. ` +
    "Antes de continuar, verifique en Siigo Nube que NO exista una factura para esta consulta. " +
    "Si existe y la desbloquea, podría emitirse un segundo documento ante la DIAN."
  );
}

export type ReleaseOutcome =
  | { kind: "released"; consultationId: string; message: string }
  | { kind: "blocked"; message: string }
  | { kind: "gone"; message: string }
  | { kind: "error"; message: string };

/**
 * Turn a DELETE /api/invoice-claims response into what the admin sees.
 *
 * The 409 `claim_emitted` is surfaced with the server's own wording and is
 * NOT offered as something to force: the server refusing is the protection.
 */
export function interpretReleaseResponse(
  status: number,
  body: unknown,
  consultationId: string,
): ReleaseOutcome {
  const message = extractErrorMessage(body);

  if (status === 200) {
    return {
      kind: "released",
      consultationId,
      message: `Consulta ${consultationId} desbloqueada. Ya puede facturarse de nuevo.`,
    };
  }
  if (status === 409) {
    return {
      kind: "blocked",
      message:
        message ??
        "Esta consulta ya tiene una factura emitida ante la DIAN y no puede desbloquearse. Anúlela con una nota crédito.",
    };
  }
  if (status === 404) {
    return {
      kind: "gone",
      message: message ?? "Esta consulta ya no tiene ninguna emisión bloqueada.",
    };
  }
  if (status === 403) {
    return { kind: "error", message: "Se requiere rol de administrador para desbloquear consultas." };
  }
  if (status === 401) {
    return { kind: "error", message: "Su sesión expiró. Vuelva a iniciar sesión." };
  }
  return {
    kind: "error",
    message: message ?? "No se pudo desbloquear la consulta. Inténtelo de nuevo.",
  };
}

const errorBodySchema = z.object({
  error: z.object({ code: z.string().optional(), message: z.string().min(1) }),
});

/** Pull the server's Spanish message out of an error body, or null if absent. */
export function extractErrorMessage(body: unknown): string | null {
  const parsed = errorBodySchema.safeParse(body);
  return parsed.success ? parsed.data.error.message : null;
}
