import { z } from "zod";

/**
 * Client-safe health-domain schema + types (zod-only: no process.env, no fetch).
 * Co-located here so the "use client" Service Semaphore card can import it
 * directly WITHOUT dragging @/services/healthCheck (and its transitive
 * ./siigoApi server code) into the browser bundle — the cause of the
 * "Element type is invalid: received a promise that resolves to: undefined"
 * RSC client-reference failure on /settings.
 */

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
