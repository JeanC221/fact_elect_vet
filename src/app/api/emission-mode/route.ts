import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPool } from "@/services/db";
import { credentialsConfigSchema, type CredentialsConfig } from "@/mappers/credentials";
import { requireAdmin, requireSession } from "@/services/routeGuard";

export const dynamic = "force-dynamic";

const DEFAULT_CONFIG: CredentialsConfig = {
  mode: "sandbox",
  configured: {},
  updatedAt: "1970-01-01T00:00:00.000Z",
};

interface CredentialsConfigRow {
  mode: string;
  configured: unknown;
  updated_at: Date;
}

function rowToConfig(row: CredentialsConfigRow): CredentialsConfig {
  return {
    mode: row.mode as CredentialsConfig["mode"],
    configured: row.configured as CredentialsConfig["configured"],
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * DECISION (fail-loudly review): this fallback is NOT acceptable as
 * configuration-with-a-safe-default, and was aligned to the project's
 * "fail loudly, never silently" rule. Rationale, in order of weight:
 *
 * 1. The default is not neutral. `DEFAULT_CONFIG.mode` is "sandbox", and
 *    `stampSendFor("sandbox")` is false — so answering "sandbox" when the read
 *    actually failed makes the app emit invoices that are never stamped at the
 *    DIAN. A clinic invoice that skips DIAN stamping is not a degraded read,
 *    it is a legally void document.
 * 2. The 200 actively destroys good state. `useEmissionOptions.fetchServerMode`
 *    discards a response only when `!res.ok`; a 200 is trusted, so every device
 *    overwrites its correctly cached "production" with "sandbox".
 * 3. The client already expected this. `settings/credentials/page.tsx` has
 *    handled `res.status === 503` since it was written ("do NOT treat this as
 *    confirmed sandbox") — the handler simply never produced it.
 *
 * A missing ROW is different and stays a 200: no row means nobody has ever
 * configured the account, which genuinely is sandbox. The distinction is
 * between "not configured" (a fact) and "could not be read" (an unknown).
 *
 * Contrast with GET /api/catalog-mapping, whose fallback was reviewed in the
 * same pass and deliberately KEPT — see the note in that file.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;
  let result;
  try {
    result = await getPool().query<CredentialsConfigRow>(
      "SELECT mode, configured, updated_at FROM credentials_config WHERE id = 1",
    );
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "storage_unavailable",
          message:
            "No se pudo leer el modo de emisión configurado. No se asume Sandbox: emitir en el modo equivocado produciría facturas sin timbrar ante la DIAN.",
        },
      },
      { status: 503 },
    );
  }

  if (result.rowCount === 0) return NextResponse.json(DEFAULT_CONFIG);

  const parsed = credentialsConfigSchema.safeParse(rowToConfig(result.rows[0]));
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
    console.error("credentials_config row failed Zod validation:", detail);
    return NextResponse.json(
      {
        error: {
          code: "config_corrupt",
          message:
            "La configuración de emisión almacenada no es válida. Revísela en Ajustes › Credenciales antes de facturar.",
        },
      },
      { status: 503 },
    );
  }
  return NextResponse.json(parsed.data);
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  try {
    const body = await req.json();
    const parsed = credentialsConfigSchema.safeParse(body);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
      return NextResponse.json({ error: { code: "invalid_payload", message: `Configuración inválida: ${detail}` } }, { status: 400 });
    }
    const pool = getPool();
    // updatedAt is taken from the client payload (not now()) to match the
    // old Blob behavior: PUT overwrites with exactly what was sent.
    await pool.query(
      `INSERT INTO credentials_config (id, mode, configured, updated_at)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET mode = EXCLUDED.mode, configured = EXCLUDED.configured, updated_at = EXCLUDED.updated_at`,
      [parsed.data.mode, JSON.stringify(parsed.data.configured), parsed.data.updatedAt],
    );
    return NextResponse.json(parsed.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al guardar la configuración.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 500 });
  }
}