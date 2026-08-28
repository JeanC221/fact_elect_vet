import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/services/auth";

/**
 * Edge route guard: protects the dashboard ("/") and all non-login routes.
 * Unauthenticated / expired / tampered session requests redirect to "/login".
 * Runs on the Edge runtime (Web Crypto) — no external JWT dependency.
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = token ? await verifySessionToken(token) : null;
  if (valid) return NextResponse.next();
  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};
