import { z } from "zod";

/**
 * Pure credentials layer (no side effects, no HTTP, no crypto).
 * Runtime validation for the admin credentials form + environment mode toggle.
 * Per 01_PROJECT_REQUIREMENTS §2.1: secret VALUES are never persisted to
 * localStorage — only the environment `mode` and per-field `configured` flags.
 */

/** Emission mode: sandbox keeps stamp.send=false; production enables DIAN stamping. */
export const environmentModeSchema = z.enum(["sandbox", "production"]);
export type EnvironmentMode = z.infer<typeof environmentModeSchema>;

/**
 * Siigo/Provet credentials form schema.
 * Partner-Id: 3-100 alphanumeric chars (§2.3 API Integration Standards).
 * Other fields: non-empty trimmed strings.
 */
export const credentialsSchema = z.object({
  partnerId: z
    .string()
    .trim()
    .min(3, "Partner-Id requiere entre 3 y 100 caracteres")
    .max(100, "Partner-Id no puede exceder 100 caracteres")
    .regex(/^[A-Za-z0-9]+$/, "Partner-Id solo admite caracteres alfanuméricos"),
  username: z.string().trim().min(1, "El usuario es obligatorio").max(100),
  accessKey: z.string().trim().min(1, "La llave de acceso es obligatoria").max(200),
  clientId: z.string().trim().min(1, "El Client ID es obligatorio").max(100),
  clientSecret: z.string().trim().min(1, "El Client Secret es obligatorio").max(200),
});
export type Credentials = z.infer<typeof credentialsSchema>;

/** Persistable config: mode + per-field configured flags (NO secret values). */
export const credentialsConfigSchema = z.object({
  mode: environmentModeSchema,
  configured: z.record(z.string(), z.boolean()),
  updatedAt: z.string().min(1),
});
export type CredentialsConfig = z.infer<typeof credentialsConfigSchema>;

/** Spanish labels for each credential field. */
export const CREDENTIAL_LABELS: Record<keyof Credentials, string> = {
  partnerId: "Partner-Id (Siigo)",
  username: "Usuario (Siigo)",
  accessKey: "Llave de acceso (Siigo)",
  clientId: "Client ID (OAuth)",
  clientSecret: "Client Secret (OAuth)",
};

/** Fields that must be masked as secrets in the UI. */
export const SECRET_FIELDS: ReadonlySet<keyof Credentials> = new Set([
  "accessKey",
  "clientSecret",
]);

export interface CredentialsFieldRow {
  id: keyof Credentials;
  label: string;
  configured: boolean;
  masked: string;
  secret: boolean;
}

const FIELD_ORDER: (keyof Credentials)[] = [
  "partnerId",
  "username",
  "accessKey",
  "clientId",
  "clientSecret",
];

/**
 * Mask a secret value for display: 8 bullets when configured+present, else empty.
 * Never returns the raw value.
 */
export function maskSecret(value: string, configured: boolean): string {
  return configured && value.trim().length > 0 ? "••••••••" : "";
}

/** Build presentational rows from the persisted config + current form values. */
export function buildCredentialsRows(
  config: CredentialsConfig,
  values: Credentials,
): CredentialsFieldRow[] {
  return FIELD_ORDER.map((id) => ({
    id,
    label: CREDENTIAL_LABELS[id],
    configured: Boolean(config.configured[id]),
    masked: maskSecret(values[id], Boolean(config.configured[id])),
    secret: SECRET_FIELDS.has(id),
  }));
}

/** Resolve the stamp.send flag from the emission mode (sandbox always false). */
export function stampSendFor(mode: EnvironmentMode): boolean {
  return mode === "production";
}

/** Zod-validated JSON serialization for localStorage persistence (no secrets). */
export function serializeCredentialsConfig(config: CredentialsConfig): string {
  return JSON.stringify(credentialsConfigSchema.parse(config));
}

/** Parse + Zod-validate a stored JSON blob; throws on corrupt/invalid input. */
export function parseCredentialsConfig(stored: string): CredentialsConfig {
  return credentialsConfigSchema.parse(JSON.parse(stored));
}
