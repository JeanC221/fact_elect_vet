import { z } from "zod";
import { SIIGO_API_BASE_URL } from "./siigoApi";

/** Tri-state semaphore value for a single external service. */
export type ServiceState = "online" | "degraded" | "offline" | "unknown";

/** External services monitored by the health semaphore. */
export type ServiceName = "provet" | "siigo" | "dian";

/** Health snapshot for a single service. */
export interface ServiceHealth {
  name: ServiceName;
  label: string;
  state: ServiceState;
  latencyMs: number | null;
  detail: string;
  checkedAt: string;
}

/** Aggregated health report consumed by the settings dashboard. */
export interface HealthReport {
  services: ServiceHealth[];
  overall: ServiceState;
  checkedAt: string;
}

/** Zod schema validating the route handler's own JSON output (§3 runtime validation). */
export const healthReportSchema = z.object({
  services: z.array(
    z.object({
      name: z.enum(["provet", "siigo", "dian"]),
      label: z.string().min(1),
      state: z.enum(["online", "degraded", "offline", "unknown"]),
      latencyMs: z.number().nullable(),
      detail: z.string().min(1),
      checkedAt: z.string().min(1),
    }),
  ),
  overall: z.enum(["online", "degraded", "offline", "unknown"]),
  checkedAt: z.string().min(1),
});

const DEGRADED_THRESHOLD_MS = 2000;
const TIMEOUT_MS = 5000;

const LABELS: Record<ServiceName, string> = {
  provet: "Provet Cloud",
  siigo: "Siigo Nube",
  dian: "DIAN (vía Siigo)",
};

/** Worst-state reducer: offline > degraded > unknown > online. O(n). */
export function aggregateOverall(states: ServiceState[]): ServiceState {
  if (states.includes("offline")) return "offline";
  if (states.includes("degraded")) return "degraded";
  if (states.includes("unknown")) return "unknown";
  return "online";
}

/** Map a single ping outcome to a semaphore state. */
export function stateFromResponse(ok: boolean, latencyMs: number): ServiceState {
  if (!ok) return "offline";
  return latencyMs > DEGRADED_THRESHOLD_MS ? "degraded" : "online";
}

const DETAIL: Record<ServiceState, string> = {
  online: "Operativo",
  degraded: "Respuesta lenta",
  offline: "No disponible",
  unknown: "Estado desconocido",
};

/** Ping one service URL with a short timeout; never throws — returns a ServiceHealth. */
export async function checkService(
  name: ServiceName,
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ServiceHealth> {
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetchImpl(url, { method: "GET", signal: controller.signal });
    const latencyMs = Date.now() - start;
    const state = stateFromResponse(res.ok, latencyMs);
    return { name, label: LABELS[name], state, latencyMs, detail: DETAIL[state], checkedAt };
  } catch {
    return {
      name, label: LABELS[name], state: "offline", latencyMs: null,
      detail: DETAIL.offline, checkedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Derive DIAN health from Siigo reachability (Siigo is the DIAN stamping proxy). */
function deriveDian(siigo: ServiceHealth): ServiceHealth {
  return {
    name: "dian", label: LABELS.dian, state: siigo.state,
    latencyMs: siigo.latencyMs, detail: DETAIL[siigo.state], checkedAt: siigo.checkedAt,
  };
}

const PROVET_BASE_URL = process.env.PROVET_BASE_URL ?? "https://api.provetcloud.com";

/**
 * Ping Provet Cloud and Siigo Nube in parallel, derive DIAN from Siigo, and
 * aggregate an overall semaphore. Safe for Sandbox/Mock (no credentials, 5s cap).
 */
export async function checkHealth(): Promise<HealthReport> {
  const [provet, siigo] = await Promise.all([
    checkService("provet", PROVET_BASE_URL),
    checkService("siigo", SIIGO_API_BASE_URL),
  ]);
  const dian = deriveDian(siigo);
  const services = [provet, siigo, dian];
  return {
    services,
    overall: aggregateOverall(services.map((s) => s.state)),
    checkedAt: new Date().toISOString(),
  };
}
