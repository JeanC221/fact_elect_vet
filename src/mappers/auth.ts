import { z } from "zod";

/**
 * Pure auth layer (no side effects, no crypto, no HTTP).
 * Runtime validation for the employee login form + Spanish error translation.
 */

/** Form values validated against the login schema. */
export interface LoginFormValues {
  email: string;
  password: string;
}

/** Zod schema for the employee login form (client + server shared). */
export const loginFormSchema = z.object({
  email: z.string().trim().min(1, "El correo es obligatorio").email("El correo no es válido"),
  password: z.string().trim().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

/** Spanish user-facing messages per auth error code (no raw traces to UI). */
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials:
    "El correo o la contraseña son incorrectos. Verifique sus credenciales e intente nuevamente.",
  missing_credentials:
    "Faltan credenciales de acceso. Contacte al administrador del sistema.",
  rate_limited:
    "Demasiados intentos fallidos. Espere unos segundos e intente nuevamente.",
  default: "No se pudo iniciar sesión. Intente nuevamente.",
};

/** Translate any auth failure code into a Spanish user-facing message. */
export function authErrorToSpanish(code: string): string {
  return AUTH_ERROR_MESSAGES[code] ?? AUTH_ERROR_MESSAGES.default;
}
