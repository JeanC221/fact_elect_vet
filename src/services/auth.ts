import { authErrorToSpanish } from "@/mappers/auth";

/**
 * Employee JWT session service (side-effectful / crypto layer).
 * Uses Web Crypto HMAC-SHA256 so the same code runs in Next.js Edge middleware
 * and Node server actions — no external JWT dependency.
 *
 * Security (per 01_PROJECT_REQUIREMENTS §2):
 *   - Token cookies: HttpOnly + SameSite=Strict + Secure(prod) + Path=/ + MaxAge=24h.
 *   - Signature compared in constant time to resist timing attacks.
 *   - Credentials sourced exclusively from environment variables.
 */

export const SESSION_COOKIE_NAME = "vet_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h
const ALG = "HS256";

/** Custom error class wrapping auth failures with a stable code. */
export class AuthError extends Error {
  code: string;
  constructor(code: string, message = "") {
    super(message || authErrorToSpanish(code));
    this.name = "AuthError";
    this.code = code;
  }
}

/** Encoded session payload carried inside the JWT. */
export interface SessionPayload {
  email: string;
  iat: number;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new AuthError("missing_credentials", "JWT_SECRET no configurado.");
  }
  return secret;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Base64url encode (Web-API only — works in Edge runtime and Node). */
function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Base64url decode to bytes (Web-API only — works in Edge runtime and Node). */
function base64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const buffer = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Sign a session token for an authenticated employee (24h expiry). */
export async function signSessionToken(payload: Pick<SessionPayload, "email">): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const body: SessionPayload = { email: payload.email, iat: now, exp: now + SESSION_TTL_SECONDS };
  const headerB64 = base64url(new TextEncoder().encode(JSON.stringify({ alg: ALG, typ: "JWT" })));
  const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(body)));
  const data = `${headerB64}.${payloadB64}`;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(data)));
  return `${data}.${base64url(sig)}`;
}

/** Verify signature + expiry. Returns payload on success, null on any failure. */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const data = `${headerB64}.${payloadB64}`;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      base64urlDecode(sigB64),
      new TextEncoder().encode(data),
    );
    if (!valid) return null;
    const body = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64))) as SessionPayload;
    if (typeof body.exp !== "number" || Math.floor(Date.now() / 1000) >= body.exp) return null;
    return body;
  } catch {
    return null;
  }
}

/** Cookie descriptor for a freshly issued session token (secure flags applied). */
export function createSessionCookie(token: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Cookie descriptor that expires the session cookie immediately on logout. */
export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64url(new Uint8Array(digest));
}

/**
 * Authenticate an employee against environment credentials.
 * Compares a sha256 hash of the supplied password in constant time.
 * Sandbox fallback demo credential is env-gated (never hard-coded).
 */
export async function authenticateEmployee(email: string, password: string): Promise<string> {
  const expectedEmail = process.env.EMPLOYEE_EMAIL;
  const expectedHash = process.env.EMPLOYEE_PASSWORD_HASH;
  if (!expectedEmail || !expectedHash) {
    throw new AuthError("missing_credentials");
  }
  const emailOk = email.trim().toLowerCase() === expectedEmail.trim().toLowerCase();
  const hash = await sha256(password);
  const hashOk = timingSafeEqual(hash, expectedHash);
  if (!emailOk || !hashOk) {
    throw new AuthError("invalid_credentials");
  }
  return signSessionToken({ email: expectedEmail });
}

/** Constant-time string comparison to mitigate timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
