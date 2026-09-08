import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/services/auth";
import type { SessionPayload } from "@/services/auth";
import { SESSION_COOKIE_NAME } from "@/services/sessionCookies";
import {
  resolveRouteAccess,
  denialBody,
  type AccessRequirement,
} from "@/mappers/routeAuthz";

/**
 * Per-handler session guard — defense in depth behind `middleware.ts`.
 *
 * Why this exists: until D0, `middleware.ts` was the ONLY layer verifying a
 * session. Next.js CVE-2025-29927 showed that a middleware check can be
 * skipped with a single HTTP header, and Vercel's own mitigation guidance is
 * to enforce authorization in the underlying route as well. In this system the
 * underlying route is `POST /api/invoices`, which stamps a legally binding DIAN
 * document — so a bypass is not a data leak, it is a fraudulent invoice.
 *
 * Policy is NOT re-derived here. `ADMIN_ONLY_RULES` in `middleware.ts` remains
 * the routing policy (including the method-aware exception for
 * `GET /api/emission-mode`); each handler simply names the requirement it
 * already had, and both layers share one decision function so they cannot
 * drift apart.
 *
 * The cookie is read via `req.cookies.get(...)`, the same accessor
 * `middleware.ts` uses, rather than parsing the `Cookie` header by hand:
 * quoting and multi-cookie headers are already solved there.
 */

/** Discriminated guard outcome: narrow on `ok` before using either branch. */
export type GuardResult =
  | { ok: true; payload: SessionPayload }
  | { ok: false; response: NextResponse };

/**
 * Verify the session cookie and check it against `requirement`.
 * Always answers JSON on failure — these guards only run inside `/api/`
 * handlers, where a redirect would be silently consumed as a response body.
 */
async function guard(req: NextRequest, requirement: AccessRequirement): Promise<GuardResult> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifySessionToken(token) : null;
  const decision = resolveRouteAccess(payload, requirement);
  if (decision.ok) {
    // `decision.ok` implies a non-null payload: resolveRouteAccess returns the
    // unauthorized denial for every null payload, whatever the requirement.
    return { ok: true, payload: payload as SessionPayload };
  }
  return {
    ok: false,
    response: NextResponse.json(denialBody(decision), { status: decision.status }),
  };
}

/** Require any authenticated session (employee or admin). */
export function requireSession(req: NextRequest): Promise<GuardResult> {
  return guard(req, "session");
}

/** Require an authenticated session carrying the admin flag. */
export function requireAdmin(req: NextRequest): Promise<GuardResult> {
  return guard(req, "admin");
}
