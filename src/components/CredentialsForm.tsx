"use client";

import { useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import {
  credentialsSchema,
  CREDENTIAL_LABELS,
  SECRET_FIELDS,
  type Credentials,
  type EnvironmentMode,
} from "@/mappers/credentials";

interface CredentialsFormProps {
  initialMode: EnvironmentMode;
  configuredMap: Record<string, boolean>;
  /** Receives validated values + chosen mode. Component never persists secrets. */
  onSave: (values: Credentials, mode: EnvironmentMode) => void;
}

const INPUT = "w-full rounded-md border border-grid-line bg-pure-white px-2 py-1 text-sm text-slate-text focus:border-clinical-blue focus:outline-none disabled:opacity-50";
const LABEL = "text-xs font-medium text-muted";
const ERROR = "text-2xs text-status-rejected-text";
const FIELD_ORDER: (keyof Credentials)[] = ["partnerId", "username", "accessKey", "clientId", "clientSecret"];
const MODE_BTN = "flex-1 rounded-md border px-2 py-1 text-xs font-semibold disabled:opacity-50 ";
const MODE_ON: Record<EnvironmentMode, string> = {
  sandbox: "border-status-accepted-border bg-status-accepted-bg text-status-accepted-text",
  production: "border-status-rejected-border bg-status-rejected-bg text-status-rejected-text",
};
const MODE_OFF = "border-grid-line bg-pure-white text-muted hover:bg-cool-grey";

/** Presentational credentials form (client): Zod validation, secret masking, inline
 * Sandbox/Producción toggle. Delegates persistence to onSave. rounded-md, Ctrl/Cmd+Enter. */
export function CredentialsForm({ initialMode, configuredMap, onSave }: CredentialsFormProps) {
  const [mode, setMode] = useState<EnvironmentMode>(initialMode);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { partnerId: "", username: "", accessKey: "", clientId: "", clientSecret: "" },
  });

  const onSubmit = (values: Credentials) => {
    setIsSubmitting(true);
    try {
      onSave(values, mode);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSecret = (id: string) => setShowSecret((s) => ({ ...s, [id]: !s[id] }));
  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit(onSubmit)();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" onKeyDown={onKey}>
      <div className="space-y-2">
        {FIELD_ORDER.map((id) => {
          const isSecret = SECRET_FIELDS.has(id);
          const configured = Boolean(configuredMap[id]);
          const shown = showSecret[id];
          return (
            <div key={id} className="space-y-1">
              <label htmlFor={id} className={LABEL}>
                {CREDENTIAL_LABELS[id]}
                {configured && <span className="ml-1 text-status-accepted-text">• Configurado</span>}
              </label>
              <div className="relative">
                <input
                  id={id}
                  type={isSecret ? (shown ? "text" : "password") : "text"}
                  autoComplete="off"
                  placeholder={configured ? "•••••••• (dejar en blanco para mantener)" : ""}
                  className={INPUT}
                  disabled={isSubmitting}
                  {...register(id)}
                />
                {isSecret && (
                  <button
                    type="button"
                    onClick={() => toggleSecret(id)}
                    disabled={isSubmitting}
                    className="absolute inset-y-0 right-1 px-1 text-2xs text-muted hover:text-clinical-blue disabled:opacity-40"
                    tabIndex={-1}
                  >
                    {shown ? "Ocultar" : "Ver"}
                  </button>
                )}
              </div>
              {errors[id] && <p className={ERROR}>{errors[id]?.message}</p>}
            </div>
          );
        })}
      </div>

      <fieldset className="space-y-1">
        <legend className={LABEL}>Modo de emisión</legend>
        <div className="flex gap-2">
          {(["sandbox", "production"] as EnvironmentMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              disabled={isSubmitting}
              className={MODE_BTN + (mode === m ? MODE_ON[m] : MODE_OFF)}
            >
              {m === "sandbox" ? "Sandbox" : "Producción"}
            </button>
          ))}
        </div>
        {mode === "production" && (
          <div className="flex items-start gap-2 rounded-md border border-status-draft-border bg-status-draft-bg px-2 py-2 text-xs text-status-draft-text">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Modo Producción: las facturas se enviarán a DIAN (<code>stamp.send=true</code>).
              Verifique las credenciales antes de guardar.
            </span>
          </div>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-clinical-blue px-3 py-2 text-sm font-semibold text-white hover:bg-clinical-blue-hover active:bg-clinical-blue-active disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Guardando...
          </>
        ) : (
          <>
            <Save className="h-4 w-4" /> Guardar credenciales
          </>
        )}
      </button>
      <p className="text-center text-2xs text-muted">Ctrl+Enter para guardar</p>
    </form>
  );
}
