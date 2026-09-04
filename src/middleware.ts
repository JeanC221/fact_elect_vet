import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/services/auth";
import { SESSION_COOKIE_NAME } from "@/services/sessionCookies";

/**
 * Edge route guard: protects the dashboard ("/") and all non-login routes.
 * Unauthenticated / expired / tampered session requests redirect to "/login".
 * Admin-only routes additionally require the `admin` flag in the verified JWT
 * payload. Runs on the Edge runtime (Web Crypto) — no external JWT dependency.
 *
 * "/api/emission-mode" is included here (not just its UI page
 * "/settings/credentials"): it's the endpoint that actually flips the account
 * into DIAN production stamping, so it must be server-enforced, not just
 * hidden by the UI.
 *
 * "/api/invoice-claims" likewise: releasing an emission claim removes the
 * only server-side guard against stamping a second DIAN document for the same
 * consultation, so it must never be reachable by the employee role.
 */
const ADMIN_ONLY_PREFIXES = [
  "/settings/credentials",
  "/settings/mapping",
  "/api/emission-mode",
  "/api/invoice-claims",
];

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = token ? await verifySessionToken(token) : null;
  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");
  if (!valid) {
    if (isApiRoute) return NextResponse.json({ error: { code: "unauthorized", message: "Sesión requerida." } }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const needsAdmin = ADMIN_ONLY_PREFIXES.some((p) => req.nextUrl.pathname.startsWith(p));
  if (needsAdmin && !valid.admin) {
    if (isApiRoute) return NextResponse.json({ error: { code: "forbidden", message: "Se requiere rol de administrador." } }, { status: 403 });
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};