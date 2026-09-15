import { authErrorToSpanish } from "@/mappers/auth";
import { base64url, signSessionToken } from "@/services/jwt";

// Re-export the token layer so "@/services/auth" consumers (proxy,
// settings pages) keep importing from here without changing import paths.
export { signSessionToken, verifySessionToken } from "@/services/jwt";
export type { SessionPayload } from "@/services/jwt";

/**
 * Employee/admin credential and role layer. Authenticates against two
 * independent env credential sets:
 *   - Receptionist: EMPLOYEE_EMAIL + EMPLOYEE_PASSWORD_HASH -> admin=false
 *   - Administrator: ADMIN_EMAIL  + ADMIN_PASSWORD_HASH      -> admin=true
 * The environment stores only the SHA-256 hash of each password (base64url),
 * never the plaintext password itself — so anyone with read access to the
 * Vercel project's environment variables (dashboard, `vercel env pull`, a
 * misconfigured Preview scope) sees a hash, not the real operational password
 * used by clinic staff. Generate a hash with:
 *   node -e "crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourPassword')).then(d => console.log(Buffer.from(d).toString('base64url')))"
 *
 * A-2 (2026-09-14): this hash is NOT irreversible. Unsalted, single-round
 * SHA-256 is fast to brute-force and has no per-install salt, so a leaked
 * hash is crackable offline against a dictionary/rainbow table — a real risk
 * for the kind of password clinic staff tends to pick. A prior revision of
 * this comment claimed the hash was irreversible; that claim was false and
 * had been used as an argument for not prioritising D1 (see
 * `PROJECT_STATE.md` — password hashing, blocked on an agreed deployment
 * window because changing the hash format invalidates the deployed
 * `ADMIN_PASSWORD_HASH`/`EMPLOYEE_PASSWORD_HASH` until regenerated in
 * Vercel). D1 replaces this with `scrypt`; not done here — this fix only
 * corrects what the comment claims about the current hash.
 *
 * Security (per 01_PROJECT_REQUIREMENTS section 2):
 *   - Credentials sourced exclusively from environment variables.
 *   - Constant-time hash comparison to resist timing attacks.
 *   - The authoritative admin flag is embedded in the JWT (enforced by
 *     proxy.ts) and returned here for the client-readable role cookie.
 */

/** Custom error class wrapping auth failures with a stable code. */
export class AuthError extends Error {
  code: string;
  constructor(code: string, message = "") {
    super(message || authErrorToSpanish(code));
    this.name = "AuthError";
    this.code = code;
  }
}

/** Result of a successful authentication: the session token + authoritative role. */
export interface AuthResult {
  token: string;
  admin: boolean;
}

/** sha256(value) as base64url - same encoding the env password hashes must use. */
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64url(new Uint8Array(digest));
}

/** Case-insensitive, trimmed email comparison. */
function emailMatches(expected: string | undefined, input: string): boolean {
  return !!expected && expected.trim().toLowerCase() === input.trim().toLowerCase();
}

/**
 * Authenticate against the admin OR receptionist credential set. Returns the
 * signed JWT (carrying the authoritative admin flag) plus that flag.
 */
export async function authenticate(email: string, password: string): Promise<AuthResult> {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    throw new AuthError("missing_credentials", "JWT_SECRET no configurado.");
  }
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminHash = process.env.ADMIN_PASSWORD_HASH;
  const employeeEmail = process.env.EMPLOYEE_EMAIL;
  const employeeHash = process.env.EMPLOYEE_PASSWORD_HASH;
  const hasAdmin = !!adminEmail && !!adminHash;
  const hasEmployee = !!employeeEmail && !!employeeHash;
  if (!hasAdmin && !hasEmployee) {
    throw new AuthError("missing_credentials");
  }
  const inputHash = await sha256(password);
  if (hasAdmin && emailMatches(adminEmail, email) && timingSafeEqual(inputHash, adminHash!)) {
    return { token: await signSessionToken({ email: adminEmail!, admin: true }), admin: true };
  }
  if (hasEmployee && emailMatches(employeeEmail, email) && timingSafeEqual(inputHash, employeeHash!)) {
    return { token: await signSessionToken({ email: employeeEmail!, admin: false }), admin: false };
  }
  throw new AuthError("invalid_credentials");
}

/** Constant-time string comparison to mitigate timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}