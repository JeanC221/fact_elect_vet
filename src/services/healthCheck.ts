import { getSiigoAccessToken, SiigoAuthError } from "./siigoAuth";
import type { ServiceState, ServiceName, ServiceHealth, HealthReport } from "@/schemas/health";

/** Re-export client-safe schema + types (server callers keep one import). */
export { healthReportSchema } from "@/schemas/health";
export type { ServiceState, ServiceName, ServiceHealth, HealthReport } from "@/schemas/health";

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

/** Ping one service URL with a short timeout and optional custom headers; never throws — returns a ServiceHealth. */
export async function checkService(
  name: ServiceName,
  url: string,
  fetchImpl: typeof fetch = fetch,
  headers?: Record<string, string>,
): Promise<ServiceHealth> {
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const init: RequestInit = {
      method: "GET",
      signal: controller.signal,
      ...(headers && { headers }),
    };
    const res = await fetchImpl(url, init);
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

/** Determine if the app is running in sandbox mode (SIIGO_SANDBOX_MODE=true). */
function isSandbox(): boolean {
  return process.env.SIIGO_SANDBOX_MODE === "true";
}

/** Canned "all online" HealthReport for sandbox/dev mode — never hits external APIs. */
function mockHealthReport(): HealthReport {
  const checkedAt = new Date().toISOString();
  const services: ServiceHealth[] = [
    { name: "provet", label: LABELS.provet, state: "online", latencyMs: 12, detail: DETAIL.online, checkedAt },
    { name: "siigo", label: LABELS.siigo, state: "online", latencyMs: 34, detail: DETAIL.online, checkedAt },
    { name: "dian", label: LABELS.dian, state: "online", latencyMs: 34, detail: DETAIL.online, checkedAt },
  ];
  return { services, overall: "online", checkedAt };
}

/** Siigo health via real OAuth token request. Never throws: online or offline with error message. */
export async function checkSiigoHealth(): Promise<ServiceHealth> {
  const name: ServiceName = "siigo";
  const checkedAt = new Date().toISOString();
  const start = Date.now();
  try {
    await getSiigoAccessToken();
    const latencyMs = Date.now() - start;
    return {
      name, label: LABELS.siigo, state: "online",
      latencyMs, detail: DETAIL.online, checkedAt,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const detail = err instanceof SiigoAuthError
      ? err.message
      : DETAIL.offline;
    return {
      name, label: LABELS.siigo, state: "offline",
      latencyMs, detail, checkedAt,
    };
  }
}

/**
 * Ping Provet (x-api-key) and Siigo (OAuth) in parallel, derive DIAN from Siigo.
 * In sandbox mode returns mock data instead of hitting external APIs.
 */
export async function checkHealth(): Promise<HealthReport> {
  if (isSandbox()) return mockHealthReport();

  const provetApiKey = process.env.PROVET_API_KEY;
  const provetHeaders = provetApiKey ? { "x-api-key": provetApiKey } : undefined;
  const [provet, siigo] = await Promise.all([
    checkService("provet", PROVET_BASE_URL, fetch, provetHeaders),
    checkSiigoHealth(),
  ]);
  const dian = deriveDian(siigo);
  const services = [provet, siigo, dian];
  return {
    services,
    overall: aggregateOverall(services.map((s) => s.state)),
    checkedAt: new Date().toISOString(),
  };
}
