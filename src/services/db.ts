import { Pool } from "pg";

/**
 * Shared Postgres connection pool (Supabase, transaction-mode pooler on :6543).
 * One pool per server process — Next.js route handlers on Vercel serverless
 * reuse the module-level singleton across invocations within the same warm
 * lambda, avoiding a new pool (and new connections) per request.
 *
 * DATABASE_URL is required in every environment (local .env.local, Vercel env
 * vars). There is no fallback: a missing connection string must fail loudly
 * at startup, not silently no-op like the old Blob fallbacks did.
 */

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL no está configurada. Defínela en .env.local (desarrollo) o en las variables de entorno de Vercel (producción).",
    );
  }
  // Supabase's pooler presents a certificate chain that Node's default trust
  // store does NOT recognize in serverless runtimes (confirmed in production:
  // `Error: self-signed certificate in certificate chain` from pg-pool with
  // plain `ssl: true`). This is a widely-reported Supabase+serverless issue,
  // not a MITM condition — see https://supabase.com/docs/guides/platform/ssl-enforcement.
  // The correct fix is supplying Supabase's own CA root explicitly (verified
  // TLS, not disabled verification): Supabase dashboard → Project Settings →
  // Database → SSL Configuration → Download Certificate Authority (CA)
  // certificate. Paste its full contents (including the BEGIN/END lines) into
  // the SUPABASE_DB_CA_CERT environment variable in Vercel.
  //
  // Do NOT set `rejectUnauthorized: false` — that disables certificate
  // verification entirely and exposes the connection to MITM interception.
  const caCert = process.env.SUPABASE_DB_CA_CERT;
  if (!caCert) {
    throw new Error(
      "SUPABASE_DB_CA_CERT no está configurada. Descarga el certificado CA desde Supabase " +
        "(Project Settings → Database → SSL Configuration → Download Certificate Authority (CA) certificate) " +
        "y pega su contenido completo (incluyendo las líneas BEGIN/END) en esa variable de entorno.",
    );
  }
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: true, ca: caCert },
    max: 5,
  });
}

/** Reuse the pool across hot invocations; create once per cold start. */
export function getPool(): Pool {
  if (!globalThis.__pgPool) {
    globalThis.__pgPool = createPool();
  }
  return globalThis.__pgPool;
}

/** Thrown when a version-checked write loses a race to a concurrent writer (optimistic concurrency conflict). */
export class VersionConflictError extends Error {
  constructor(message = "version_conflict") {
    super(message);
    this.name = "VersionConflictError";
  }
}