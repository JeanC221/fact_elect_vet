import { SESSION_TTL_SECONDS } from "@/services/sessionCookies";

/**
 * Pure Web Crypto JWT layer (HMAC-SHA256). No credentials, no HTTP — only the
 * token sign/verify + base64url codec. Runs in Next.js Edge middleware and Node
 * server actions with no external JWT dependency and no Node `Buffer`.
 *
 * Security (per 01_PROJECT_REQUIREMENTS §2):
 *   - Signature verified by crypto.subtle.verify (constant time).
 *   - Signing key from JWT_SECRET (min 16 chars).
 */
const ALG = "HS256";

/** Encoded session payload carried inside the JWT. */
export interface SessionPayload {
  email: string;
  admin: boolean;
  iat: number;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET no configurado.");
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
export function base64url(bytes: Uint8Array): string {
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

/** Sign a session token for an authenticated user (expiry = SESSION_TTL_SECONDS, currently 8h — see A-3 in sessionCookies.ts). */
export async function signSessionToken(
  payload: Pick<SessionPayload, "email"> & { admin?: boolean },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const body: SessionPayload = {
    email: payload.email,
    admin: payload.admin ?? false,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
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
    return { ...body, admin: Boolean(body.admin) };
  } catch {
    return null;
  }
}
