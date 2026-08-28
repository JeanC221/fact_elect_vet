"use client";

import { Cog, Home, LogOut, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/settings/credentials", label: "Credenciales", icon: Cog },
  { href: "/settings/mapping", label: "Catálogo", icon: Cog },
  { href: "/settings/profile", label: "Perfil", icon: User },
] as const;

/**
 * Clinical-nav bar used by the dashboard and settings pages.
 * Highlights the active route; Sandbox badge + logout on the right.
 * Clinical palette, compact p-1, rounded-md, max 6px borders.
 */
export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between border-b border-grid-line bg-pure-white px-3 py-1">
      <div className="flex items-center gap-1">
        <span className="mr-2 text-sm font-semibold text-clinical-blue">
          Facturación Electrónica
        </span>
        <nav className="flex gap-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-clinical-blue text-white"
                    : "text-muted hover:bg-cool-grey"
                }`}
              >
                <Icon className="h-3 w-3" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted">Sandbox</span>
        <form action={logoutAction}>
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-md border border-grid-line px-2 py-1 text-xs font-semibold text-muted hover:bg-cool-grey"
          >
            <LogOut className="h-3 w-3" /> Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}