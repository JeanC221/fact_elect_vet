import { z } from "zod";

/** Custom error class for Provet OAuth failures. */
export class ProvetAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProvetAuthError";
  }
}

/** Provet OAuth token response (client-credentials grant). */
export const provetTokenResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  token_type: z.string().trim().optional().default("Bearer"),
  expires_in: z.number().int().positive().optional().default(3600),
  scope: z.string().trim().optional().default(""),
});

interface AuthCache {
  accessToken: string;
  expiresAt: number;
}

let cache: AuthCache | null = null;

/** Reset the in-memory token cache (test hook). */
export function resetProvetAuthCache(): void {
  cache = null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ProvetAuthError(
      "missing_credentials",
      `Variable de entorno ${name} no configurada.`,
    );
  }
  return value;
}

/**
 * Retrieve a valid Provet Cloud access token using the OAuth2
 * Client Credentials Grant (POST PROVET_TOKEN_URL, form-urlencoded).
 * Tokens are cached in memory and renewed 60s before expiry.
 *
 * The returned opaque token is meant to be sent as the `?access_token=`
 * query parameter on Provet REST resource requests (see provetApi.ts).
 */
export async function getProvetAccessToken(): Promise<string> {
  const tokenUrl = requireEnv("PROVET_TOKEN_URL");
  const clientId = requireEnv("PROVET_CLIENT_ID");
  const clientSecret = requireEnv("PROVET_CLIENT_SECRET");

  const now = Date.now();
  if (cache && now < cache.expiresAt - 60_000) {
    return cache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  let res: Response;
  try {
    res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new ProvetAuthError(
      "service_unavailable",
      "No se pudo contactar el servicio de autenticación de Provet.",
    );
  }

  if (!res.ok) {
    let message = `Autenticación con Provet falló (HTTP ${res.status}).`;
    try {
      const data = (await res.json()) as { detail?: string; error?: string };
      message = data.detail ?? data.error ?? message;
    } catch {
      // Non-JSON error body — keep the status-derived message.
    }
    throw new ProvetAuthError("auth_failed", message);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ProvetAuthError(
      "auth_failed",
      "Respuesta de autenticación de Provet no es JSON válido.",
    );
  }

  const parsed = provetTokenResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new ProvetAuthError(
      "auth_failed",
      "Respuesta de autenticación de Provet tiene formato inesperado.",
    );
  }

  const ttlSeconds = Math.max(parsed.data.expires_in - 60, 60);
  cache = {
    accessToken: parsed.data.access_token,
    expiresAt: now + ttlSeconds * 1000,
  };
  return cache.accessToken;
}
