import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, Cog, Lock, User } from "lucide-react";
import { NavBar } from "@/components/NavBar";
import { HealthCheckStatus } from "@/components/HealthCheckStatus";
import { InvoiceClaimsPanel } from "@/components/InvoiceClaimsPanel";
import { verifySessionToken } from "@/services/auth";
import { SESSION_COOKIE_NAME } from "@/services/sessionCookies";

const linkBase =
  "inline-flex items-center gap-2 rounded-md border border-grid-line bg-pure-white px-3 py-2 text-sm font-semibold text-slate-text hover:bg-cool-grey";

/**
 * Settings container — server component.
 * Embeds the real-time Service Semaphore (HealthCheckStatus) and exposes
 * clean navigation links: "Perfil" for everyone; "Credenciales" and "Catálogo"
 * only when the verified JWT carries admin (authoritative, unlike the
 * client-only vet_role cookie used by NavBar). Redirects to /login if
 * unauthenticated. Guarded by `proxy.ts`; this is defense-in-depth.
 */
export default async function SettingsPage() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) redirect("/login");
  const isAdmin = payload.admin === true;

  return (
    <main className="flex h-screen w-screen flex-col bg-cool-grey">
      <NavBar />
      <div className="flex flex-1 flex-col items-center gap-3 overflow-y-auto p-4">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className={`${linkBase} text-xs`}
            aria-label="Volver al panel"
          >
            <ArrowLeft className="h-3 w-3" /> Panel
          </Link>
        </div>

        <header className="w-full max-w-md">
          <h1 className="text-base font-semibold text-clinical-blue">Configuración</h1>
          <p className="text-xs text-muted">
            Semáforo de servicios externos y accesos administrativos.
          </p>
        </header>

        <HealthCheckStatus />

        {/*
          Admin-only rescue panel. Rendered here (and not on its own route)
          because it is a rare-use safety net, not a workflow screen. The
          server-side guard is ADMIN_ONLY_RULES in proxy.ts; this
          `isAdmin` check only avoids showing an employee a panel whose every
          request would 403.
        */}
        {isAdmin && <InvoiceClaimsPanel />}

        <nav className="w-full max-w-md space-y-2">
          <Link href="/settings/profile" className={`${linkBase} w-full`}>
            <User className="h-4 w-4" /> Perfil
          </Link>
          {isAdmin ? (
            <>
              <Link href="/settings/credentials" className={`${linkBase} w-full`}>
                <Cog className="h-4 w-4" /> Credenciales
              </Link>
              <Link href="/settings/mapping" className={`${linkBase} w-full`}>
                <Cog className="h-4 w-4" /> Catálogo
              </Link>
            </>
          ) : (
            <p className="flex items-center gap-2 rounded-md border border-grid-line bg-pure-white px-3 py-2 text-xs text-muted">
              <Lock className="h-3 w-3" />
              Credenciales y Catálogo están reservados al administrador.
            </p>
          )}
        </nav>
      </div>
    </main>
  );
}
