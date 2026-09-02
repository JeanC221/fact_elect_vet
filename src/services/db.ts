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
    // Supabase's pooler (port 6543) presents a valid, publicly verifiable
    // certificate — `ssl: true` (the pg default) verifies it normally. Do
    // NOT set `rejectUnauthorized: false`: that disables certificate
    // verification entirely and exposes the connection to MITM interception.
    // If a runtime ever reports a certificate-chain error against Supabase,
    // fix it by supplying Supabase's CA root explicitly, not by disabling
    // verification.
    ssl: true,
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