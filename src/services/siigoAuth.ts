import { z } from "zod";
import { siigoErrorSchema } from "@/schemas/siigo";

/** Custom error class for Siigo OAuth failures. */
export class SiigoAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
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

let cache: AuthCache | null = null;

/** Reset the in-memory token cache (test hook). */
export function resetSiigoAuthCache(): void {
  cache = null;
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

/**
 * Retrieve a valid Siigo access token using the Client Credentials Grant
 * against POST /auth. Tokens are cached in memory and renewed before expiry.
 */
export async function getSiigoAccessToken(): Promise<SiigoAuthResult> {
  const baseUrl = siigoBaseUrl();
  const username = requireEnv("SIIGO_USERNAME");
  const accessKey = requireEnv("SIIGO_ACCESS_KEY");
  const partnerId = requireEnv("SIIGO_PARTNER_ID");

  const now = Date.now();
  if (cache && now < cache.expiresAt - 60_000) {
    return { accessToken: cache.accessToken, partnerId };
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, access_key: accessKey }),
    });
  } catch {
    throw new SiigoAuthError(
      "service_unavailable",
      "No se pudo contactar el servicio de autenticación de Siigo.",
    );
  }

  if (!res.ok) {
    let message = `Autenticación con Siigo falló (HTTP ${res.status}).`;
    try {
      const parsed = siigoErrorSchema.safeParse(await res.json());
      if (parsed.success) message = parsed.data.message;
    } catch {
      // Non-JSON error body — keep status-derived message.
    }
    throw new SiigoAuthError("auth_failed", message);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new SiigoAuthError(
      "auth_failed",
      "Respuesta de autenticación de Siigo no es JSON válido.",
    );
  }

  const parsed = siigoTokenResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new SiigoAuthError(
      "auth_failed",
      "Respuesta de autenticación de Siigo tiene formato inesperado.",
    );
  }

  const ttlSeconds = Math.max(parsed.data.expires_in - 60, 60);
  cache = {
    accessToken: parsed.data.access_token,
    expiresAt: now + ttlSeconds * 1000,
  };

  return { accessToken: parsed.data.access_token, partnerId };
}
