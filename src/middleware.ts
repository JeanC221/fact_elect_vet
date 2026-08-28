import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/services/auth";
import { SESSION_COOKIE_NAME } from "@/services/sessionCookies";

/**
 * Edge route guard: protects the dashboard ("/") and all non-login routes.
 * Unauthenticated / expired / tampered session requests redirect to "/login".
 * Admin-only routes ("/settings/credentials", "/settings/mapping") additionally
 * require the `admin` flag in the verified JWT payload. Runs on the Edge
 * runtime (Web Crypto) — no external JWT dependency.
 */
const ADMIN_ONLY_PREFIXES = ["/settings/credentials", "/settings/mapping"];

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = token ? await verifySessionToken(token) : null;
  if (!valid) return NextResponse.redirect(new URL("/login", req.url));
  const needsAdmin = ADMIN_ONLY_PREFIXES.some((p) => req.nextUrl.pathname.startsWith(p));
  if (needsAdmin && !valid.admin) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
