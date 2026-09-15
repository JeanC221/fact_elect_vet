import { z } from "zod";
import { siigoErrorSchema } from "@/schemas/siigo";
import { SiigoApiError, SIIGO_POST_TIMEOUT_MS } from "./siigoApi";

/** Custom error class for Siigo OAuth failures. */
export class SiigoAuthError extends SiigoApiError {
  constructor(
    public code: string,
    message: string,
  ) {
    super(code, message);
    this.name = "SiigoAuthError";
  }
}

/** Siigo /auth success response. */
export const siigoTokenResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  token_type: z.string().trim().optional().default("Bearer"),
  expires_in: z.number().int().positive().optional().default(86400),
});

interface AuthCache {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, AuthCache>();

/** Reset the in-memory token cache (test hook). */
export function resetSiigoAuthCache(): void {
  tokenCache.clear();
}

function siigoBaseUrl(): string {
  return (
    process.env.SIIGO_API_BASE_URL ??
    process.env.SIIGO_BASE_URL ??
    "https://api.siigo.com"
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new SiigoAuthError(
      "missing_credentials",
      `Variable de entorno ${name} no configurada.`,
    );
  }
  return value;
}

/** Result of a successful Siigo authentication. */
export interface SiigoAuthResult {
  accessToken: string;
  partnerId: string;
}

/** Explicit Siigo credentials (UI-supplied; never persisted to localStorage). */
export interface SiigoCredentials {
  username: string;
  accessKey: string;
  partnerId: string;
}

/** Resolve credentials from an explicit override or fall back to env vars. */
function resolveCreds(creds?: SiigoCredentials): SiigoCredentials {
  if (creds) return creds;
  return {
    username: requireEnv("SIIGO_USERNAME"),
    accessKey: requireEnv("SIIGO_ACCESS_KEY"),
    partnerId: requireEnv("SIIGO_PARTNER_ID"),
  };
}

/**
 * Cache key derived from the full credential triple (partnerId + username +
 * accessKey), not just partnerId. Keying on partnerId alone means rotating a
 * compromised access key while keeping the same Partner-Id would silently
 * reuse the previous key's still-valid cached token — a credentials/health
 * check against the new key could then pass without Siigo ever having seen
 * it. The key material itself is never logged; only a short, non-reversible
 * hash goes into the in-memory cache key.
 */
function cacheKeyFor(partnerId: string, username: string, accessKey: string): string {
  // FNV-1a — fast, deterministic, non-cryptographic; only used to avoid
  // storing raw credentials as a Map key, not as a security boundary.
  let hash = 0x811c9dc5;
  for (const ch of `${username}:${accessKey}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `siigo:${partnerId}:${(hash >>> 0).toString(16)}`;
}

/**
 * Retrieve a valid Siigo access token using the Client Credentials Grant
 * against POST /auth. Tokens are cached in memory and renewed before expiry.
 * Pass explicit `credentials` to bypass env vars (UI health/catalog checks).
 */
export async function getSiigoAccessToken(
  credentials?: SiigoCredentials,
): Promise<SiigoAuthResult> {
  const baseUrl = siigoBaseUrl();
  const { username, accessKey, partnerId } = resolveCreds(credentials);
  const key = cacheKeyFor(partnerId, username, accessKey);

  const now = Date.now();
  const cached = tokenCache.get(key);
  if (cached && now < cached.expiresAt - 60_000) {
    return { accessToken: cached.accessToken, partnerId };
  }

  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIIGO_POST_TIMEOUT_MS);
  try {
    res = await fetch(`${baseUrl}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, access_key: accessKey }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new SiigoAuthError(
        "request_timeout",
        `Siigo no respondió en ${SIIGO_POST_TIMEOUT_MS / 1000}s al autenticar.`,
      );
    }
    throw new SiigoAuthError(
      "service_unavailable",
      "No se pudo contactar el servicio de autenticacion de Siigo.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let message = `Autenticacion con Siigo fallo (HTTP ${res.status}).`;
    try {
      const parsed = siigoErrorSchema.safeParse(await res.json());
      if (parsed.success) message = parsed.data.message;
    } catch {
      // Non-JSON error body - keep status-derived message.
    }
    throw new SiigoAuthError("auth_failed", message);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new SiigoAuthError(
      "auth_failed",
      "Respuesta de autenticacion de Siigo no es JSON valido.",
    );
  }

  const parsed = siigoTokenResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new SiigoAuthError(
      "auth_failed",
      "Respuesta de autenticacion de Siigo tiene formato inesperado.",
    );
  }

  const ttlSeconds = Math.max(parsed.data.expires_in - 60, 60);
  tokenCache.set(key, {
    accessToken: parsed.data.access_token,
    expiresAt: now + ttlSeconds * 1000,
  });

  return { accessToken: parsed.data.access_token, partnerId };
}
