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
  return new Pool({
    connectionString,
    // Supabase's pooled connection (port 6543) terminates TLS with a cert
    // chain not always present in serverless runtimes' trust store; this
    // matches Supabase's own documented client config for that endpoint.
    ssl: { rejectUnauthorized: false },
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