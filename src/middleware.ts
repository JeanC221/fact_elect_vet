import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/services/auth";
import { SESSION_COOKIE_NAME } from "@/services/sessionCookies";
import { ACCESS_DENIED, denialBody } from "@/mappers/routeAuthz";

/**
 * Edge route guard: protects the dashboard ("/") and all non-login routes.
 * Unauthenticated / expired / tampered session requests redirect to "/login".
 * Admin-only routes additionally require the `admin` flag in the verified JWT
 * payload. Runs on the Edge runtime (Web Crypto) — no external JWT dependency.
 *
 * "/api/emission-mode" is included here (not just its UI page
 * "/settings/credentials"): PUT is the endpoint that actually flips the
 * account into DIAN production stamping, so it must be server-enforced, not
 * just hidden by the UI.
 *
 * Its GET, however, is the opposite case and is exempted by method. Every
 * dashboard load calls it from `useEmissionOptions.fetchServerMode` to learn
 * whether the account emits in sandbox or production. While the whole prefix
 * was admin-only, an employee session got 403 on every load, that fetch
 * returned null, `setMode` was never called, and the client fell back to its
 * "sandbox" default — and `stampSendFor("sandbox")` is false, so a
 * receptionist emitted invoices that are never stamped at the DIAN and
 * therefore have no legal validity. The response body carries no secrets:
 * `credentialsConfigSchema` is `{ mode, configured: Record<string, boolean>,
 * updatedAt }`, and `credentials_config` has no secret column to leak.
 *
 * The exemption is expressed as a per-route whitelist of methods, not a
 * blanket "GET is free" rule: anything outside `sessionOnlyMethods` still
 * requires admin, so an unforeseen verb fails closed. "/settings/credentials",
 * "/settings/mapping" and "/api/invoice-claims" are served over GET and stay
 * admin-only on every method.
 *
 * "/api/invoice-claims": releasing an emission claim removes the only
 * server-side guard against stamping a second DIAN document for the same
 * consultation, so it must never be reachable by the employee role.
 *
 * The two refusal bodies are no longer inlined here: D0.1 lifted them into
 * `@/mappers/routeAuthz` so this middleware and the per-handler guards in
 * `@/services/routeGuard` cannot answer the same rejection with different
 * Spanish. The routing policy below (ADMIN_ONLY_RULES) stays here and is NOT
 * re-derived by the handler guards.
 */
interface AdminOnlyRule {
  prefix: string;
  /** Methods that need only a valid session. Every other method requires admin. */
  sessionOnlyMethods?: readonly string[];
}

const ADMIN_ONLY_RULES: readonly AdminOnlyRule[] = [
  { prefix: "/settings/credentials" },
  { prefix: "/settings/mapping" },
  { prefix: "/api/emission-mode", sessionOnlyMethods: ["GET"] },
  { prefix: "/api/invoice-claims" },
];

/** True when this path+method pair is reserved to the admin role. */
function requiresAdmin(pathname: string, method: string): boolean {
  return ADMIN_ONLY_RULES.some(
    (rule) =>
      pathname.startsWith(rule.prefix) &&
      !(rule.sessionOnlyMethods?.includes(method) ?? false),
  );
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = token ? await verifySessionToken(token) : null;
  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");
  if (!valid) {
    if (isApiRoute) return NextResponse.json(denialBody(ACCESS_DENIED.unauthorized), { status: ACCESS_DENIED.unauthorized.status });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const needsAdmin = requiresAdmin(req.nextUrl.pathname, req.method);
  if (needsAdmin && !valid.admin) {
    if (isApiRoute) return NextResponse.json(denialBody(ACCESS_DENIED.forbidden), { status: ACCESS_DENIED.forbidden.status });
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico).*)"],
};