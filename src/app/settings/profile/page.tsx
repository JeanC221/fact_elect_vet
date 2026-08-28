import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CheckCircle2, LogOut, Mail } from "lucide-react";
import { NavBar } from "@/components/NavBar";
import { logoutAction } from "@/app/actions";
import { verifySessionToken } from "@/services/auth";
import { SESSION_COOKIE_NAME } from "@/services/sessionCookies";

const SESSION_TTL_HOURS = 24;

/** Formats a unix-seconds expiry as a Colombian-localized timestamp. */
function formatExpiry(exp: number): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(exp * 1000));
}

/**
 * Profile page — server component.
 * Reads the session cookie, verifies the token, and displays the
 * authenticated employee's active shift ("Sesión de Caja Activa") plus a
 * prominent logout action. Redirects to /login if unauthenticated.
 */
export default async function ProfilePage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) redirect("/login");

  return (
    <main className="flex h-screen w-screen flex-col bg-cool-grey">
      <NavBar />
      <div className="flex flex-1 items-start justify-center overflow-y-auto p-4">
        <section className="w-full max-w-sm rounded-md border border-grid-line bg-pure-white p-5 shadow-sm">
          <header className="mb-4 space-y-1">
            <h1 className="text-base font-semibold text-clinical-blue">
              Perfil
            </h1>
            <p className="text-xs text-muted">
              Estado de sesión del empleado autenticado.
            </p>
          </header>

          <div className="space-y-3">
            <div className="rounded-md border border-status-accepted-border bg-status-accepted-bg p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-status-accepted-text" />
                <span className="text-sm font-semibold text-status-accepted-text">
                  Sesión de Caja Activa
                </span>
              </div>
              <p className="mt-1 text-xs text-status-accepted-text">
                Turno abierto · validez {SESSION_TTL_HOURS}h.
              </p>
            </div>

            <div className="rounded-md border border-grid-line bg-cool-grey p-3">
              <div className="flex items-center gap-2 text-xs text-muted">
                <Mail className="h-3 w-3" />
                <span className="font-medium">Operador en turno</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-text">
                {payload.email}
              </p>
              <p className="mt-2 text-xs text-muted">
                Vence: {formatExpiry(payload.exp)}
              </p>
            </div>

            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-clinical-blue px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-clinical-blue-hover active:bg-clinical-blue-active"
              >
                <LogOut className="h-4 w-4" />
                Cerrar Sesión
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}