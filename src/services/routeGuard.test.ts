import { describe, it, expect, beforeAll } from "vitest";
import { requireSession, requireAdmin } from "./routeGuard";
import {
  TEST_JWT_SECRET,
  EMPLOYEE_SESSION,
  ADMIN_SESSION,
  anonymousRequest,
  sessionRequest,
  tamperedSessionRequest,
} from "@/test/sessionRequest";

/**
 * Handler-level session guard — defense in depth behind `proxy.ts`.
 *
 * The threat this closes: the boundary file is the ONLY authorization layer, so
 * a middleware bypass (CVE-2025-29927 was exactly one HTTP header) reaches
 * `POST /api/invoices` unauthenticated and stamps a DIAN document. These tests
 * therefore exercise the guard with no proxy in the picture at all.
 *
 * Every denial here must be JSON, never a redirect: these guards only ever run
 * inside `/api/` route handlers, which is the `isApiRoute` branch of
 * `proxy.ts`. A 307 to `/login` from an API route would be parsed as a
 * successful response body by `fetch` callers.
 */

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

describe("requireSession", () => {
  it("admits an employee — the receptionist role must reach ordinary endpoints", async () => {
    const guard = await requireSession(await sessionRequest("/api/products", EMPLOYEE_SESSION));
    expect(guard.ok).toBe(true);
    if (guard.ok) expect(guard.payload).toMatchObject({ email: EMPLOYEE_SESSION.email, admin: false });
  });

  it("admits an admin", async () => {
    const guard = await requireSession(await sessionRequest("/api/products", ADMIN_SESSION));
    expect(guard.ok).toBe(true);
    if (guard.ok) expect(guard.payload.admin).toBe(true);
  });

  it("refuses a request with no cookie with a 401 JSON body, not a redirect", async () => {
    const guard = await requireSession(anonymousRequest("/api/products"));
    expect(guard.ok).toBe(false);
    if (guard.ok) return;
    expect(guard.response.status).toBe(401);
    expect(guard.response.headers.get("location")).toBeNull();
    await expect(guard.response.json()).resolves.toEqual({
      error: { code: "unauthorized", message: "Sesión requerida." },
    });
  });

  it("refuses a tampered cookie exactly like an absent one — no oracle for the attacker", async () => {
    const guard = await requireSession(tamperedSessionRequest("/api/products"));
    expect(guard.ok).toBe(false);
    if (guard.ok) return;
    expect(guard.response.status).toBe(401);
    await expect(guard.response.json()).resolves.toEqual({
      error: { code: "unauthorized", message: "Sesión requerida." },
    });
  });
});

describe("requireAdmin", () => {
  it("admits an admin", async () => {
    const guard = await requireAdmin(await sessionRequest("/api/invoice-claims", ADMIN_SESSION, { method: "DELETE" }));
    expect(guard.ok).toBe(true);
  });

  it("refuses an employee with 403 forbidden — releasing a claim would allow a second DIAN stamp", async () => {
    const guard = await requireAdmin(await sessionRequest("/api/invoice-claims", EMPLOYEE_SESSION, { method: "DELETE" }));
    expect(guard.ok).toBe(false);
    if (guard.ok) return;
    expect(guard.response.status).toBe(403);
    await expect(guard.response.json()).resolves.toEqual({
      error: { code: "forbidden", message: "Se requiere rol de administrador." },
    });
  });

  it("refuses an anonymous caller with 401, not 403 — the session gate runs first", async () => {
    const guard = await requireAdmin(anonymousRequest("/api/invoice-claims", { method: "DELETE" }));
    expect(guard.ok).toBe(false);
    if (guard.ok) return;
    expect(guard.response.status).toBe(401);
  });
});

describe("routeGuard — the guard is independent of the request, not of the cookie", () => {
  /**
   * The method-aware exception for `/api/emission-mode` lives in
   * `proxy.ts` (ADMIN_ONLY_RULES) and stays there. The handler guard must
   * NOT re-derive policy from the path or verb, or the two layers drift. It
   * decides purely from the cookie plus the requirement the handler names.
   */
  it("does not infer the requirement from the path or the method", async () => {
    const put = await requireSession(
      await sessionRequest("/api/emission-mode", EMPLOYEE_SESSION, { method: "PUT" }),
    );
    expect(put.ok).toBe(true);
  });

  it("reads the cookie through NextRequest.cookies, surviving a multi-cookie header", async () => {
    const req = await sessionRequest("/api/products", ADMIN_SESSION);
    req.cookies.set("vet_role", "admin");
    const guard = await requireSession(req);
    expect(guard.ok).toBe(true);
  });

  it("rejects a session signed with a different secret", async () => {
    const req = await sessionRequest("/api/products", ADMIN_SESSION);
    process.env.JWT_SECRET = "a-completely-different-secret-value";
    const guard = await requireSession(req);
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(401);
  });
});
