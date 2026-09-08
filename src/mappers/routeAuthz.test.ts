import { describe, it, expect } from "vitest";
import { resolveRouteAccess, denialBody, ACCESS_DENIED } from "./routeAuthz";

/**
 * Pure authorization decision layer.
 *
 * This mapper is the single source of truth for "may this session reach this
 * route", shared by `middleware.ts` (first line) and `services/routeGuard.ts`
 * (defense in depth inside every handler). Keeping it pure means the decision
 * can be exhaustively tested without a Request, a cookie jar or a JWT.
 *
 * The ordering rule below is the one that matters: an ABSENT session is 401
 * even on an admin-only route. Answering 403 there would tell an anonymous
 * caller that the route exists and is admin-only, and it would diverge from
 * `middleware.ts`, which checks the session (lines 64-67) strictly before the
 * role (lines 68-72). Both layers must deny identically or the handler guard
 * becomes a second, subtly different policy.
 */

const EMPLOYEE = { admin: false };
const ADMIN = { admin: true };

describe("resolveRouteAccess — session gate runs before the role gate", () => {
  it("denies an absent session with 401, not 403, even on an admin-only route", () => {
    const decision = resolveRouteAccess(null, "admin");
    expect(decision).toEqual({
      ok: false,
      status: 401,
      code: "unauthorized",
      message: "Sesión requerida.",
    });
  });

  it("denies an absent session with 401 on a session-only route", () => {
    expect(resolveRouteAccess(null, "session")).toMatchObject({ ok: false, status: 401 });
  });
});

describe("resolveRouteAccess — role gate", () => {
  it("lets an employee through a session-only route", () => {
    expect(resolveRouteAccess(EMPLOYEE, "session")).toEqual({ ok: true });
  });

  it("refuses an employee on an admin-only route with 403 forbidden", () => {
    expect(resolveRouteAccess(EMPLOYEE, "admin")).toEqual({
      ok: false,
      status: 403,
      code: "forbidden",
      message: "Se requiere rol de administrador.",
    });
  });

  it("lets an admin through both requirements", () => {
    expect(resolveRouteAccess(ADMIN, "session")).toEqual({ ok: true });
    expect(resolveRouteAccess(ADMIN, "admin")).toEqual({ ok: true });
  });

  it("treats a falsy admin flag as employee, never as admin", () => {
    expect(resolveRouteAccess({ admin: false }, "admin")).toMatchObject({ ok: false, status: 403 });
  });
});

describe("denialBody — wire shape is identical to the one middleware.ts already emits", () => {
  it("wraps the denial as { error: { code, message } } and nothing else", () => {
    expect(denialBody(ACCESS_DENIED.unauthorized)).toEqual({
      error: { code: "unauthorized", message: "Sesión requerida." },
    });
    expect(denialBody(ACCESS_DENIED.forbidden)).toEqual({
      error: { code: "forbidden", message: "Se requiere rol de administrador." },
    });
  });

  it("never leaks the numeric status into the body — status belongs in the HTTP response", () => {
    expect(denialBody(ACCESS_DENIED.forbidden)).not.toHaveProperty("status");
    expect(denialBody(ACCESS_DENIED.forbidden).error).not.toHaveProperty("status");
  });
});

/**
 * Drift guard. `middleware.ts` used to inline these two literals; D0.1 moved
 * them here so the middleware and the handler guards cannot answer the same
 * refusal with different Spanish. If someone edits a message, this fails and
 * forces them to notice that two layers depend on it.
 */
describe("ACCESS_DENIED — the exact literals the UI error banners already match on", () => {
  it("pins the unauthorized denial", () => {
    expect(ACCESS_DENIED.unauthorized).toEqual({
      status: 401,
      code: "unauthorized",
      message: "Sesión requerida.",
    });
  });

  it("pins the forbidden denial", () => {
    expect(ACCESS_DENIED.forbidden).toEqual({
      status: 403,
      code: "forbidden",
      message: "Se requiere rol de administrador.",
    });
  });
});
