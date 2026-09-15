/**
 * Session & role cookie descriptors (no crypto, no side effects beyond env read).
 *
 * Security model (per 01_PROJECT_REQUIREMENTS §2):
 *   - Session cookie (`vet_session`): HttpOnly + SameSite=Strict + Secure(prod) +
 *     Path=/ + MaxAge=8h. Carries the JWT; never readable by client JS.
 *   - Role cookie (`vet_role`): NON-HttpOnly (client-readable) for UI display
 *     only. Value "admin" | "user". The authoritative `admin` flag lives inside
 *     the HttpOnly JWT and is enforced by the middleware; tampering this cookie
 *     only shows/hides nav links that the middleware would still block.
 *
 * A-3 (2026-09-14, mitigation only): TTL cut from 24h to 8h. There is no
 * in-app password-change flow — credentials rotate as env vars in Vercel,
 * outside this codebase — so a live JWT signed under the old password stays
 * valid for the rest of its TTL regardless of when the env var changes. The
 * only immediate revocation lever is rotating JWT_SECRET, which also logs out
 * every OTHER session, admin included. Shortening the TTL bounds that
 * exposure window to at most one shift instead of a full day; it does not
 * close it. The actual fix (a session epoch stored in `credentials_config`,
 * checked at verify time) is deliberately out of scope here — it is a data
 * model change and a runtime decision (whether Edge middleware can afford a
 * DB read on every request), reserved for its own session.
 */
export const SESSION_COOKIE_NAME = "vet_session";
export const ROLE_COOKIE_NAME = "vet_role";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h — see A-3 note above

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
