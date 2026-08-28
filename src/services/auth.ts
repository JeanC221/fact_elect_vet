import { authErrorToSpanish } from "@/mappers/auth";
import { base64url, signSessionToken } from "@/services/jwt";

// Re-export the token layer so "@/services/auth" consumers (middleware,
// settings pages) keep importing from here without changing import paths.
export { signSessionToken, verifySessionToken } from "@/services/jwt";
export type { SessionPayload } from "@/services/jwt";

/**
 * Employee/admin credential and role layer. Authenticates against two
 * independent env credential sets:
 *   - Receptionist: EMPLOYEE_EMAIL + EMPLOYEE_PASSWORD  -> admin=false
 *   - Administrator: ADMIN_EMAIL  + ADMIN_PASSWORD       -> admin=true
 * Passwords are stored as plain text in .env.local, hashed at runtime
 * with SHA-256 (Web Crypto) and compared in constant time.
 *
 * Security (per 01_PROJECT_REQUIREMENTS section 2):
 *   - Credentials sourced exclusively from environment variables.
 *   - Constant-time hash comparison to resist timing attacks.
 *   - The authoritative admin flag is embedded in the JWT (enforced by
 *     middleware) and returned here for the client-readable role cookie.
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
  const adminPlain = process.env.ADMIN_PASSWORD;
  const employeeEmail = process.env.EMPLOYEE_EMAIL;
  const employeePlain = process.env.EMPLOYEE_PASSWORD;
  const hasAdmin = !!adminEmail && !!adminPlain;
  const hasEmployee = !!employeeEmail && !!employeePlain;
  if (!hasAdmin && !hasEmployee) {
    throw new AuthError("missing_credentials");
  }
  const inputHash = await sha256(password);
  if (hasAdmin && emailMatches(adminEmail, email) && timingSafeEqual(inputHash, await sha256(adminPlain!))) {
    return { token: await signSessionToken({ email: adminEmail!, admin: true }), admin: true };
  }
  if (hasEmployee && emailMatches(employeeEmail, email) && timingSafeEqual(inputHash, await sha256(employeePlain!))) {
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
