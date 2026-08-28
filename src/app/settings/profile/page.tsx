import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { NavBar } from "@/components/NavBar";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/services/auth";

/**
 * Profile page — server component.
 * Reads the session cookie, verifies the token, and displays the
 * authenticated employee email. Redirects to /login if unauthenticated.
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
              Información del empleado autenticado.
            </p>
          </header>

          <div className="space-y-3">
            <div className="rounded-md border border-grid-line bg-cool-grey p-3">
              <div className="flex items-center gap-2 text-xs text-muted">
                <Mail className="h-3 w-3" />
                <span className="font-medium">Correo institucional</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-text">
                {payload.email}
              </p>
            </div>

            <div className="rounded-md border border-grid-line bg-cool-grey p-3">
              <p className="text-xs text-muted">
                Sesión activa — expira automáticamente tras 24h de inactividad.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}