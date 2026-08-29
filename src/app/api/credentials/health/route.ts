import { NextResponse } from "next/server";
import { credentialsSchema } from "@/mappers/credentials";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/credentials/health — live Siigo credential validation.
 * Validates the UI-supplied credentials with Zod, attempts POST /auth
 * server-side, and returns ok=true when the badge should turn green.
 * Credentials live only in the request body — never persisted (§2.1).
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const creds = credentialsSchema.parse(body);
    await getSiigoAccessToken({
      username: creds.username,
      accessKey: creds.accessKey,
      partnerId: creds.partnerId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SiigoAuthError) {
      return NextResponse.json(
        { ok: false, error: { code: err.code, message: "Credenciales de Siigo invalidas." } },
        { status: 502 },
      );
    }
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json(
        { ok: false, error: { code: "invalid_credentials", message: "Formato de credenciales invalido." } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "default", message: "Error inesperado al validar credenciales." } },
      { status: 500 },
    );
  }
}
