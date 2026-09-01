import { NextResponse } from "next/server";
import { getPool } from "@/services/db";
import { credentialsConfigSchema, type CredentialsConfig } from "@/mappers/credentials";

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

export async function GET(): Promise<NextResponse> {
  try {
    const pool = getPool();
    const result = await pool.query<CredentialsConfigRow>(
      "SELECT mode, configured, updated_at FROM credentials_config WHERE id = 1",
    );
    if (result.rowCount === 0) return NextResponse.json(DEFAULT_CONFIG);
    const parsed = credentialsConfigSchema.safeParse(rowToConfig(result.rows[0]));
    if (!parsed.success) return NextResponse.json(DEFAULT_CONFIG);
    return NextResponse.json(parsed.data);
  } catch {
    return NextResponse.json(DEFAULT_CONFIG);
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
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