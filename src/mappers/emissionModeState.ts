import { credentialsConfigSchema, type EnvironmentMode } from "@/mappers/credentials";

/**
 * Emission-mode gate state — pure, side-effect free.
 *
 * Two concepts that used to be fused into one `isModeReady` flag:
 *
 *  - "I finished trying to load the mode"  -> `isModeReady`, kept in the hook.
 *  - "the server told me the mode in this session" -> `modeConfirmed`, here.
 *
 * The old flag was set to true even when `GET /api/emission-mode` failed, so
 * the emission gate opened on a mode nobody had confirmed. On a device with no
 * cache that mode is the `"sandbox"` default, and `stampSendFor("sandbox")` is
 * false, so the invoice is never stamped at the DIAN.
 *
 * The other half of the fix is that a cached mode must be distinguishable from
 * a defaulted one. `parseCachedMode` returns a discriminated result precisely
 * so that "no cache" and "cached sandbox" can never be confused: treating the
 * former as the latter would be treating a default as data.
 */

/** Where the client's idea of the mode came from, when the server did not answer. */
export type CachedModeRead =
  | { source: "cache"; mode: EnvironmentMode }
  | { source: "absent" }
  | { source: "corrupt" }
  | { source: "ssr" };

export type EmissionGateReason =
  /** The mode request has not settled yet. */
  | "loading"
  /** The server answered in this session. */
  | "confirmed"
  /** Server unreachable; a real cached `production` is being trusted, with a warning. */
  | "cached_production"
  /** Server unreachable; the cache says `sandbox`, which cannot be trusted. */
  | "cached_sandbox"
  /** Server unreachable and there is no usable cache at all. */
  | "unconfirmed";

export interface EmissionGate {
  /** Mode the emission mapper should use. Falls back to the historical `sandbox` default. */
  mode: EnvironmentMode;
  /** True only when the server returned a mode during this session. */
  modeConfirmed: boolean;
  /** Whether invoice emission may proceed. Credit notes are NOT gated — see creditNote.ts. */
  canEmit: boolean;
  reason: EmissionGateReason;
}

/**
 * Parse the `fact_vet.credentialsConfig` blob into a discriminated read.
 *
 * Mirrors the previous `readMode()` byte for byte on the happy path; the only
 * change is that the three failure cases now report themselves instead of all
 * collapsing into the string `"sandbox"`.
 */
export function parseCachedMode(raw: string | null): CachedModeRead {
  if (!raw) return { source: "absent" };
  try {
    return { source: "cache", mode: credentialsConfigSchema.parse(JSON.parse(raw)).mode };
  } catch {
    return { source: "corrupt" };
  }
}

interface EmissionGateInput {
  /** The mode request has finished, successfully or not (the old `isModeReady`). */
  settled: boolean;
  /** Mode returned by GET /api/emission-mode, or null when the request failed. */
  serverMode: EnvironmentMode | null;
  cached: CachedModeRead;
}

/**
 * Decide whether emission may proceed.
 *
 * The sandbox/production asymmetry is deliberate and is the reason this is not
 * a symmetric "block unless confirmed" rule:
 *
 *  - A wrong `sandbox` emits `stamp.send: false`. The invoice looks successful,
 *    is never stamped, has no legal validity, and cannot be annulled with a
 *    credit note until it is stamped. Silent, and expensive to unwind.
 *  - A wrong `production` emits `stamp.send: true` against an account that is
 *    not configured for it. Siigo refuses with `document_settings` before any
 *    document exists. Loud, and free to unwind.
 *
 * So an unconfirmed `sandbox` blocks and an unconfirmed `production` proceeds
 * under a visible warning. Blocking both would stop a clinic from invoicing in
 * order to prevent the cheaper of the two failures.
 */
export function resolveEmissionGate({ settled, serverMode, cached }: EmissionGateInput): EmissionGate {
  if (!settled) {
    return { mode: cachedOrDefault(cached), modeConfirmed: false, canEmit: false, reason: "loading" };
  }
  if (serverMode) {
    return { mode: serverMode, modeConfirmed: true, canEmit: true, reason: "confirmed" };
  }
  if (cached.source === "cache") {
    const trusted = cached.mode === "production";
    return {
      mode: cached.mode,
      modeConfirmed: false,
      canEmit: trusted,
      reason: trusted ? "cached_production" : "cached_sandbox",
    };
  }
  return { mode: "sandbox", modeConfirmed: false, canEmit: false, reason: "unconfirmed" };
}

/** Historical default preserved for the `mode` field: a blocked gate still needs a value. */
function cachedOrDefault(cached: CachedModeRead): EnvironmentMode {
  return cached.source === "cache" ? cached.mode : "sandbox";
}

/** Spanish copy for each blocked/warned state. Pure lookup — the UI only renders it. */
export const EMISSION_GATE_MESSAGES: Record<EmissionGateReason, string | null> = {
  loading: "Verificando el modo de emisión configurado (sandbox o producción)…",
  confirmed: null,
  cached_production:
    "No se pudo confirmar el modo con el servidor. Se está usando el último modo conocido: Producción. La factura se timbrará ante la DIAN; si el servidor sigue sin responder, avise al administrador.",
  cached_sandbox:
    "No se pudo confirmar el modo con el servidor. El último modo conocido es Sandbox, que NO timbra ante la DIAN, y el modo real podría ser Producción. La emisión está bloqueada hasta poder confirmarlo.",
  unconfirmed:
    "No se pudo confirmar con el servidor si esta cuenta emite en Sandbox o en Producción, y este dispositivo no tiene un modo guardado. Emitir ahora podría generar una factura sin timbrar ante la DIAN.",
};
