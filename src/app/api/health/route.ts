import { NextResponse } from "next/server";
import { checkHealth } from "@/services/healthCheck";
import { healthReportSchema } from "@/schemas/health";

/**
 * Dedicated health endpoint (GET /api/health).
 * Pings Provet Cloud + Siigo Nube via the service layer (no credentials,
 * 5s timeout cap), derives DIAN from Siigo, and returns a Zod-validated
 * HealthReport. The UI consumes this same-origin endpoint — never the raw
 * external APIs — per the layer-decoupling rules.
 */
export async function GET(): Promise<NextResponse> {
  const report = await checkHealth();
  return NextResponse.json(healthReportSchema.parse(report));
}
