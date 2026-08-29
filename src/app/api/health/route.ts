import { NextResponse } from "next/server";
import { z } from "zod";
import { credentialsSchema } from "@/mappers/credentials";
import { checkHealth } from "@/services/healthCheck";
import { healthReportSchema } from "@/schemas/health";
import { SiigoAuthError } from "@/services/siigoAuth";

/**
 * Dedicated health endpoint.
 * GET  /api/health       — pings Provet + Siigo (env creds), returns HealthReport.
 * POST /api/health       — accepts UI credentials in the body, validates them
 *                         with Zod, and runs the authenticated health check so
 *                         the badge turns green when valid keys are provided.
 * The UI consumes this same-origin endpoint — never the raw external APIs.
 */
export async function GET(): Promise<NextResponse> {
  const report = await checkHealth();
  return NextResponse.json(healthReportSchema.parse(report));
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const creds = credentialsSchema.parse(await req.json());
    const report = await checkHealth({
      username: creds.username, accessKey: creds.accessKey, partnerId: creds.partnerId,
    });
    return NextResponse.json(healthReportSchema.parse(report));
  } catch (err) {
    if (err instanceof SiigoAuthError) {
      return NextResponse.json(
        { error: { code: err.code, message: "Credenciales de Siigo invalidas." } },
        { status: 502 },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: "invalid_credentials", message: "Formato de credenciales invalido." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: "default", message: "Error inesperado al validar credenciales." } },
      { status: 500 },
    );
  }
}

