import { SiigoApiError } from "./siigoApi";
import { UnmappedPaymentMethodError } from "@/mappers/catalogMapping";
import { EmptyConsultationError, MissingEmissionSettingError } from "@/mappers/provetToSiigo";
import { MissingCreditNoteSettingError } from "@/mappers/creditNote";

/** Action the user can take to resolve the error. */
export type QuickAction =
  | "edit_identification"
  | "edit_payments"
  | "edit_email"
  | "auto_retry"
  | "save_draft"
  | "none";

/** Visual severity for the error banner. */
export type ErrorSeverity = "error" | "warning";

/** Structured translation of a Siigo/DIAN error for the UI layer. */
export interface TranslatedError {
  code: string;
  message: string;
  detail?: string;
  severity: ErrorSeverity;
  quickAction: QuickAction;
  retryable: boolean;
}

interface TranslationEntry {
  message: string;
  severity: ErrorSeverity;
  quickAction: QuickAction;
  retryable: boolean;
}

/** Spanish user-facing messages per Siigo/DIAN error code (no raw traces to UI). */
const ERROR_TRANSLATIONS: Record<string, TranslationEntry> = {
  invalid_identification: {
    message:
      "La cédula o NIT ingresado no es válido para procesamiento DIAN. Corrija la identificación y reintente.",
    severity: "error",
    quickAction: "edit_identification",
    retryable: false,
  },
  invalid_total_payments: {
    message:
      "El total pagado no coincide con el subtotal de los ítems facturados. Verifique los montos.",
    severity: "error",
    quickAction: "edit_payments",
    retryable: false,
  },
  parameter_required: {
    message:
      "Falta un campo obligatorio (ej. correo o dirección). Complete el campo y reintente.",
    severity: "error",
    quickAction: "edit_email",
    retryable: false,
  },
  invalid_reference: {
    message:
      "Un código o ID enviado no existe en Siigo (producto, forma de pago, vendedor o tipo de documento). Verifique el mapeo de catálogos en Ajustes.",
    severity: "error",
    quickAction: "none",
    retryable: false,
  },
  invalid_date: {
    message:
      "La fecha de la factura es inválida. Para facturación electrónica debe ser la fecha actual (no puede ser anterior).",
    severity: "error",
    quickAction: "none",
    retryable: false,
  },
  invalid_payment: {
    message:
      "La forma de pago enviada no es válida para este tipo de comprobante. Verifique el mapeo de métodos de pago.",
    severity: "error",
    quickAction: "edit_payments",
    retryable: false,
  },
  parameter_inactive: {
    message:
      "El parámetro enviado (forma de pago, vendedor, etc.) está inactivo en Siigo Nube. Actívelo o use otro.",
    severity: "error",
    quickAction: "none",
    retryable: false,
  },
  customer_settings: {
    message:
      "El cliente no tiene contactos creados en su perfil de Siigo Nube. Cree un contacto para este cliente o verifique que tenga correo electrónico.",
    severity: "error",
    quickAction: "edit_email",
    retryable: false,
  },
  invalid_email: {
    message: "El correo electrónico del cliente no tiene un formato válido.",
    severity: "error",
    quickAction: "edit_email",
    retryable: false,
  },
  document_settings: {
    message:
      "Falta configuración en el tipo de comprobante en Siigo Nube (vendedor por ítem, decimales, numeración, etc.). Revise Configuración → Transacciones → Facturas.",
    severity: "error",
    quickAction: "none",
    retryable: false,
  },
  invalid_payload: {
    message: "El formato de los datos enviados no es válido. Contacte soporte técnico si persiste.",
    severity: "error",
    quickAction: "none",
    retryable: false,
  },
  invalid_value: {
    message:
      "Un valor enviado no es válido para el producto. Verifique en Siigo → Inventario que la unidad de medida del producto admita decimales si la cantidad tiene decimales, o revise el mapeo de ese ítem en Ajustes.",
    severity: "error",
    quickAction: "none",
    retryable: false,
  },
  invalid_document: {
    message:
      "El XML de la factura electrónica solo está disponible una vez que la factura fue aceptada por la DIAN (con CUFE). El PDF sí puede descargarse mientras esté en borrador.",
    severity: "warning",
    quickAction: "none",
    retryable: false,
  },
  unhandled_error: {
    // The server now reconciles this against Siigo before surfacing it, so by
    // the time the staff member sees it the document has been confirmed absent
    // and a retry has already failed too.
    message:
      "Siigo falló de forma inesperada y, tras verificar, la factura no llegó a generarse. " +
      "Intente nuevamente en unos minutos; si persiste, contacte a soporteapi@siigo.com.",
    severity: "error",
    quickAction: "none",
    retryable: false,
  },
  ambiguous_reconciliation: {
    message:
      "Se encontró más de una factura para esta consulta en Siigo. Revise cuál es la correcta y anule la sobrante con una nota crédito.",
    severity: "error",
    quickAction: "none",
    retryable: false,
  },
  reconciliation_truncated: {
    // C-7. NOT the same message as ambiguous_reconciliation: here nothing was
    // found, but the search gave up before reaching the end of the listing —
    // absence is unconfirmed, not contradicted. retryable: false on purpose,
    // same reasoning as ambiguous_reconciliation: a blind retry could stamp a
    // genuine duplicate at the DIAN.
    message:
      "No se pudo confirmar si la factura ya existe en Siigo: la verificación se detuvo antes de revisar todo el listado. " +
      "Revise manualmente en Siigo Nube antes de reintentar.",
    severity: "error",
    quickAction: "none",
    retryable: false,
  },
  requests_limit: {
    message: "Servidor de facturación ocupado. Reintento automático en curso...",
    severity: "warning",
    quickAction: "auto_retry",
    retryable: true,
  },
  service_unavailable: {
    message:
      "El servicio de Siigo/DIAN no respondió tras varios intentos. NO se puede confirmar si la factura alcanzó a generarse: verifíquelo en Siigo Nube antes de reintentar, para no emitir un documento duplicado ante la DIAN.",
    severity: "warning",
    quickAction: "save_draft",
    retryable: true,
  },
  auth_failed: {
    message:
      "La autenticación con Siigo falló. Verifique las credenciales en Configuración e intente nuevamente.",
    severity: "error",
    quickAction: "none",
    retryable: false,
  },
};

const DEFAULT_TRANSLATION: TranslationEntry = {
  message: "No se pudo emitir la factura. Verifique los datos e intente nuevamente.",
  severity: "error",
  quickAction: "none",
  retryable: false,
};

/** Translate any emission failure into a structured Spanish error for the UI. */
export function translateSiigoError(error: unknown): TranslatedError {
  if (error instanceof UnmappedPaymentMethodError) {
    return {
      code: "unmapped_payment",
      message: error.message,
      severity: "error",
      quickAction: "edit_payments",
      retryable: false,
    };
  }
  if (error instanceof MissingEmissionSettingError) {
    return {
      code: `missing_${error.setting}`,
      message: error.message,
      severity: "error",
      quickAction: "none",
      retryable: false,
    };
  }

  if (error instanceof EmptyConsultationError) {
    // The message already states the exact remedy in Spanish; a table entry
    // would replace it with generic "verifique los datos" advice.
    return {
      code: "empty_consultation",
      message: error.message,
      severity: "error",
      quickAction: error.reason === "no_fallback_configured" ? "edit_payments" : "none",
      retryable: false,
    };
  }
  if (error instanceof MissingCreditNoteSettingError) {
    return {
      code: "missing_credit_note_document_type",
      message: error.message,
      severity: "error",
      quickAction: "none",
      retryable: false,
    };
  }
  if (error instanceof SiigoApiError) {
    // The server already produced a precise, staff-facing Spanish message for
    // this one (which invoice blocked the emission, or why the previous
    // attempt could not be confirmed). Replacing it with a table entry would
    // surface the generic "verifique los datos e intente nuevamente" — advice
    // to do exactly the wrong thing when the consultation is already invoiced.
    if (error.code === "consultation_already_claimed") {
      return {
        code: error.code,
        message: error.message,
        severity: "warning",
        quickAction: "none",
        retryable: false,
      };
    }
    const entry = ERROR_TRANSLATIONS[error.code] ?? DEFAULT_TRANSLATION;
    return { code: error.code, detail: error.message, ...entry };
  }
  const detail = error instanceof Error ? error.message : undefined;
  return { code: "default", detail, ...DEFAULT_TRANSLATION };
}

/** Whether the error code is transient and supports automatic retry. */
export function isRetryable(code: string): boolean {
  return code === "requests_limit" || code === "service_unavailable";
}

/**
 * Exponential backoff delay in ms: 1s × 2^attempt, capped at 16s, plus 0–500ms jitter.
 * Returns -1 when attempt >= maxRetries (signal to stop retrying).
 */
export function calculateBackoff(attempt: number, maxRetries = 5): number {
  if (attempt >= maxRetries) return -1;
  return Math.round(
    Math.min(1000 * Math.pow(2, attempt), 16000) + Math.random() * 500,
  );
}

/** Options for retryWithBackoff. */
export interface RetryOptions {
  maxRetries: number;
  onRetry?: (attempt: number, delayMs: number) => void;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Retry an async operation with exponential backoff for transient Siigo errors.
 * Only retries when the thrown error is a SiigoApiError with a retryable code.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const code = err instanceof SiigoApiError ? err.code : "default";
      if (!isRetryable(code)) throw err;
      const delay = calculateBackoff(attempt, opts.maxRetries);
      if (delay < 0) throw err;
      opts.onRetry?.(attempt + 1, delay);
      await sleep(delay);
      attempt++;
    }
  }
}