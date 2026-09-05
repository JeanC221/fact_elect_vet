import { NextResponse } from "next/server";

/**
 * TEMPORAL — BORRAR ANTES DEL MERGE A MAIN.
 * Reporta qué variables de entorno llegan al runtime. Nunca expone valores:
 * solo presencia y longitud, que es lo único necesario para diagnosticar
 * `missing_credentials`.
 */
export const dynamic = "force-dynamic";

const NAMES = [
  "JWT_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD_HASH",
  "EMPLOYEE_EMAIL",
  "EMPLOYEE_PASSWORD_HASH",
  "DATABASE_URL",
  "SUPABASE_DB_CA_CERT",
  "SIIGO_USERNAME",
  "SIIGO_ACCESS_KEY",
  "SIIGO_PARTNER_ID",
  "PROVET_BASE_URL",
];

export async function GET(): Promise<NextResponse> {
  const report = Object.fromEntries(
    NAMES.map((n) => {
      const v = process.env[n];
      return [n, v === undefined ? "AUSENTE" : v.length === 0 ? "VACIA" : `ok (${v.length} chars)`];
    }),
  );
  return NextResponse.json({
    vercelEnv: process.env.VERCEL_ENV ?? "(sin VERCEL_ENV)",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "(desconocida)",
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
    report,
  });
}