"use client";

import { useEffect, useState } from "react";
import { type LucideIcon, Cog, Home, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/settings", label: "Configuración", icon: Settings },
  { href: "/settings/credentials", label: "Credenciales", icon: Cog, adminOnly: true },
  { href: "/settings/mapping", label: "Catálogo", icon: Cog, adminOnly: true },
  { href: "/settings/profile", label: "Perfil", icon: User },
];

/** Reads the client-readable vet_role cookie (UI display only — non-HttpOnly). */
function readIsAdmin(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c === "vet_role=admin");
}

/**
 * Clinical-nav bar used by the dashboard and settings pages.
 * Highlights the active route; Sandbox badge + logout on the right.
 * Admin-only links (Credenciales, Catálogo) are hidden for non-admins
 * based on the vet_role cookie; proxy.ts enforces the real guard.
 * Clinical palette, compact p-1, rounded-md, max 6px borders.
 */
export function NavBar() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => setIsAdmin(readIsAdmin()), []);

  return (
    <header className="flex items-center justify-between border-b border-grid-line bg-pure-white px-3 py-1">
      <div className="flex items-center gap-1">
        <span className="mr-2 text-sm font-semibold text-clinical-blue">
          Facturación 38 Plus Hospital Veterinario
        </span>
        <nav className="flex gap-0.5">
          {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${active ? "bg-clinical-blue text-white" : "text-muted hover:bg-cool-grey"}`}
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