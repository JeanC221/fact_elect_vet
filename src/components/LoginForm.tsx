"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Loader2, LogIn } from "lucide-react";
import { loginFormSchema, type LoginFormValues } from "@/mappers/auth";

interface LoginFormProps {
  /** Server action invoked with validated values; returns a Spanish error or null (redirect on success). */
  action: (values: LoginFormValues) => Promise<{ error: string | null }>;
}

const INPUT =
  "w-full rounded-md border border-grid-line bg-pure-white px-2 py-1 text-sm text-slate-text focus:border-clinical-blue focus:outline-none disabled:opacity-50";
const LABEL = "text-xs font-medium text-muted";
const ERROR = "text-2xs text-status-rejected-text";

/**
 * Presentational employee login form.
 * Pure UI: no direct HTTP, no crypto. Delegates to the injected server action.
 * Clinical palette, 1-column, rounded-md (6px). Ctrl/Cmd+Enter to submit.
 */
export function LoginForm({ action }: LoginFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsSubmitting(true);
    setServerError(null);
    try {
      const res = await action(values);
      if (res.error) setServerError(res.error);
      // On success the action calls redirect(); the client navigates automatically.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="w-full max-w-sm space-y-3"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          handleSubmit(onSubmit)();
        }
      }}
    >
      <div className="space-y-1">
        <label htmlFor="email" className={LABEL}>
          Correo institucional
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          className={INPUT}
          disabled={isSubmitting}
          {...register("email")}
        />
        {errors.email && <p className={ERROR}>{errors.email.message}</p>}
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className={LABEL}>
          Contraseña
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className={INPUT}
            disabled={isSubmitting}
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            disabled={isSubmitting}
            className="absolute inset-y-0 right-1 px-1 text-2xs text-muted hover:text-clinical-blue disabled:opacity-40"
            tabIndex={-1}
          >
            {showPassword ? "Ocultar" : "Ver"}
          </button>
        </div>
        {errors.password && <p className={ERROR}>{errors.password.message}</p>}
      </div>

      {serverError && (
        <div className="flex items-start gap-2 rounded-md border border-status-rejected-border bg-status-rejected-bg px-2 py-2 text-xs text-status-rejected-text">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-clinical-blue px-3 py-2 text-sm font-semibold text-white hover:bg-clinical-blue-hover active:bg-clinical-blue-active disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando...
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" /> Iniciar sesión
          </>
        )}
      </button>
      <p className="text-center text-2xs text-muted">Ctrl+Enter para ingresar</p>
    </form>
  );
}

