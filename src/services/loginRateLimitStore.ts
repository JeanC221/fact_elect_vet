import { z } from "zod";
import { getPool } from "@/services/db";
import { EMPTY_STATE, type RateLimitState } from "@/mappers/loginRateLimit";

/**
 * Per-email login rate-limit storage (Postgres, one row per hashed email).
 * A storage read/write failure here NEVER blocks login — rate-limiting is a
 * defense-in-depth layer, not the primary control (that's the password check
 * itself), so failing open is the correct trade-off for an internal clinic
 * tool. This fail-open behavior is unchanged from the Blob-backed version.
 */

const rateLimitStateSchema = z.object({
  attempts: z.array(z.number()),
  lockedUntil: z.number().nullable(),
});

/** Stable, filesystem-safe key per email (case/whitespace-insensitive) — never the raw email as the row key. */
async function emailHash(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Read the current rate-limit state for an email. Any failure (not found, corrupt, network) → EMPTY_STATE (fail open). */
export async function readRateLimitState(email: string): Promise<RateLimitState> {
  try {
    const hash = await emailHash(email);
    const pool = getPool();
    const result = await pool.query<{ attempts: unknown; locked_until: string | null }>(
      "SELECT attempts, locked_until FROM login_rate_limits WHERE email_hash = $1",
      [hash],
    );
    if (result.rowCount === 0) return EMPTY_STATE;
    const raw = { attempts: result.rows[0].attempts, lockedUntil: result.rows[0].locked_until === null ? null : Number(result.rows[0].locked_until) };
    const parsed = rateLimitStateSchema.safeParse(raw);
    return parsed.success ? parsed.data : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

/** Persist the rate-limit state for an email. Failures are swallowed — never blocks the login flow. */
export async function writeRateLimitState(email: string, state: RateLimitState): Promise<void> {
  try {
    const hash = await emailHash(email);
    const pool = getPool();
    await pool.query(
      `INSERT INTO login_rate_limits (email_hash, attempts, locked_until)
       VALUES ($1, $2, $3)
       ON CONFLICT (email_hash) DO UPDATE SET attempts = EXCLUDED.attempts, locked_until = EXCLUDED.locked_until`,
      [hash, JSON.stringify(state.attempts), state.lockedUntil],
    );
  } catch {
    // Storage unavailable — rate limiting silently no-ops for this request
    // rather than blocking a legitimate login attempt.
  }
}