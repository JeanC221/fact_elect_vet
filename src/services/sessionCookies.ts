/**
 * Session & role cookie descriptors (no crypto, no side effects beyond env read).
 *
 * Security model (per 01_PROJECT_REQUIREMENTS §2):
 *   - Session cookie (`vet_session`): HttpOnly + SameSite=Strict + Secure(prod) +
 *     Path=/ + MaxAge=24h. Carries the JWT; never readable by client JS.
 *   - Role cookie (`vet_role`): NON-HttpOnly (client-readable) for UI display
 *     only. Value "admin" | "user". The authoritative `admin` flag lives inside
 *     the HttpOnly JWT and is enforced by the middleware; tampering this cookie
 *     only shows/hides nav links that the middleware would still block.
 */
export const SESSION_COOKIE_NAME = "vet_session";
export const ROLE_COOKIE_NAME = "vet_role";
export const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h

/** Cookie descriptor for a freshly issued session token (secure flags applied). */
export function createSessionCookie(token: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Cookie descriptor that expires the session cookie immediately on logout. */
export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

/** Client-readable role cookie descriptor (UI display only — non-HttpOnly). */
export function createRoleCookie(isAdmin: boolean) {
  return {
    name: ROLE_COOKIE_NAME,
    value: isAdmin ? "admin" : "user",
    httpOnly: false,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Cookie descriptor that expires the role cookie immediately on logout. */
export function clearRoleCookie() {
  return {
    name: ROLE_COOKIE_NAME,
    value: "",
    httpOnly: false,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}
