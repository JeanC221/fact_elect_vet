/**
 * Pure authorization decision layer — no I/O, no `next/server`, no crypto.
 *
 * Single source of truth for "may this session reach this route", consumed by
 * two callers that must never disagree:
 *   - `proxy.ts` — the first line. Runs on the Node.js runtime since A-4
 *     (was `middleware.ts` on Edge; `proxy` cannot be configured for Edge).
 *   - `services/routeGuard.ts` — defense in depth inside every route handler,
 *     because a middleware bypass otherwise reaches `POST /api/invoices`
 *     unauthenticated (see 01_PROJECT_REQUIREMENTS §2).
 *
 * Ordering rule: an ABSENT session is 401 even on an admin-only route. 403
 * there would confirm to an anonymous caller that the route exists and is
 * admin-only, and it would diverge from `middleware.ts`, which checks the
 * session strictly before the role. Two layers denying differently is a policy
 * fork, not defense in depth.
 */

/** What a route demands: a valid session, or a valid session carrying `admin`. */
export type AccessRequirement = "session" | "admin";

/** A refusal: the HTTP status plus the stable code/message pair the UI maps. */
export interface AccessDenial {
  readonly status: 401 | 403;
  readonly code: "unauthorized" | "forbidden";
  readonly message: string;
}

/**
 * The two refusals this system can produce, pinned here so the middleware and
 * the handler guards cannot answer the same rejection with different Spanish.
 * These literals were inlined in `middleware.ts` until D0.1 lifted them out.
 */
export const ACCESS_DENIED = {
  unauthorized: {
    status: 401,
    code: "unauthorized",
    message: "Sesión requerida.",
  },
  forbidden: {
    status: 403,
    code: "forbidden",
    message: "Se requiere rol de administrador.",
  },
} as const satisfies Record<string, AccessDenial>;

/** Discriminated result: narrow on `ok` before using either branch. */
export type AccessDecision = { ok: true } | ({ ok: false } & AccessDenial);

/** The only part of a session payload this decision depends on. */
export interface RoleBearingPayload {
  readonly admin: boolean;
}

/**
 * Decide whether `payload` satisfies `requirement`.
 * `payload` is null when there is no cookie, or when the JWT failed signature
 * or expiry verification — both are indistinguishable to the caller by design.
 */
export function resolveRouteAccess(
  payload: RoleBearingPayload | null,
  requirement: AccessRequirement,
): AccessDecision {
  if (!payload) return { ok: false, ...ACCESS_DENIED.unauthorized };
  if (requirement === "admin" && payload.admin !== true) {
    return { ok: false, ...ACCESS_DENIED.forbidden };
  }
  return { ok: true };
}

/**
 * Wire shape for a denial: `{ error: { code, message } }`, matching the error
 * envelope required by .clinerules §3 and already emitted by `middleware.ts`.
 * The numeric status is deliberately excluded — it belongs in the HTTP
 * response, not duplicated in the body where a client could trust the wrong one.
 */
export function denialBody(denial: AccessDenial): {
  error: { code: string; message: string };
} {
  return { error: { code: denial.code, message: denial.message } };
}
