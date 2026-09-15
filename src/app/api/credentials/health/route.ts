import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { credentialsSchema } from "@/mappers/credentials";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { requireAdmin } from "@/services/routeGuard";

export const dynamic = "force-dynamic";

/**
 * POST /api/credentials/health — live Siigo credential validation.
 * Validates the UI-supplied credentials with Zod, attempts POST /auth
 * server-side, and returns ok=true when the badge should turn green.
 * Credentials live only in the request body — never persisted (§2.1).
 *
 * A-1: admin-only. Used exclusively from /settings/credentials (already an
 * admin-only page), but nothing previously stopped an employee session from
 * calling it directly to probe Siigo credentials. Policy mirrors
 * middleware.ts's ADMIN_ONLY_RULES entry for this prefix.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
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
