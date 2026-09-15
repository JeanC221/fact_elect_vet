import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { signSessionToken } from "./services/jwt";
import { SESSION_COOKIE_NAME } from "./services/sessionCookies";

/**
 * Route-guard regression suite.
 *
 * The guard that matters most here is the method-aware exception for
 * `/api/emission-mode`. `GET` on that route is what `useEmissionOptions`
 * calls on every dashboard load to learn whether the account emits in
 * `sandbox` or `production`. While the whole prefix was admin-only, an
 * employee session got 403 on every load, `fetchServerMode` returned null,
 * `setMode` was never called and the client silently fell back to the
 * `sandbox` default — which sets `stamp.send: false`, i.e. an invoice that
 * is never stamped at the DIAN and therefore has no legal validity.
 *
 * `PUT` on the same route is what flips the account into production
 * stamping and stays admin-only. The exception is deliberately per-method
 * and per-route: it must NOT generalise to "GET is free".
 */

const EMPLOYEE = { email: "recepcion@clinica.co", admin: false };
const ADMIN = { email: "admin@clinica.co", admin: true };

beforeAll(() => {
  process.env.JWT_SECRET = "middleware-test-secret-not-a-real-key";
});

async function request(
  path: string,
  method: string,
  session: { email: string; admin: boolean } | null,
): Promise<Response> {
  const headers = new Headers();
  if (session) {
    const token = await signSessionToken(session);
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${token}`);
  }
  return middleware(new NextRequest(new URL(`https://app.local${path}`), { method, headers }));
}

describe("middleware — GET /api/emission-mode is readable by any authenticated employee", () => {
  it("lets an employee GET the emission mode, so the client can confirm it instead of defaulting to sandbox", async () => {
    const res = await request("/api/emission-mode", "GET", EMPLOYEE);
    expect(res.status).toBe(200);
  });

  it("still refuses an employee PUT, which is what flips the account into DIAN production stamping", async () => {
    const res = await request("/api/emission-mode", "PUT", EMPLOYEE);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "forbidden" } });
  });

  it("refuses an employee on any method other than GET — the exception is a whitelist, not a blacklist", async () => {
    for (const method of ["POST", "DELETE", "PATCH"]) {
      const res = await request("/api/emission-mode", method, EMPLOYEE);
      expect(res.status, `${method} must stay admin-only`).toBe(403);
    }
  });

  it("lets an admin through on both GET and PUT", async () => {
    expect((await request("/api/emission-mode", "GET", ADMIN)).status).toBe(200);
    expect((await request("/api/emission-mode", "PUT", ADMIN)).status).toBe(200);
  });

  it("still requires a session: no cookie is 401, not an anonymous read of the emission mode", async () => {
    const res = await request("/api/emission-mode", "GET", null);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "unauthorized" } });
  });
});

describe("middleware — the method exception does not leak to the other admin-only routes", () => {
  it("keeps /api/invoice-claims admin-only on every method, GET included", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await request("/api/invoice-claims", method, EMPLOYEE);
      expect(res.status, `invoice-claims ${method} must stay admin-only`).toBe(403);
    }
    expect((await request("/api/invoice-claims", "GET", ADMIN)).status).toBe(200);
  });

  it("keeps /settings/mapping and /settings/credentials admin-only on GET, redirecting the employee to the dashboard", async () => {
    for (const path of ["/settings/mapping", "/settings/credentials"]) {
      const res = await request(path, "GET", EMPLOYEE);
      expect(res.status, `${path} must redirect an employee`).toBe(307);
      expect(res.headers.get("location")).toBe("https://app.local/");
    }
  });
});

describe("middleware — A-1: catalog-mapping PUT and credentials/health are admin-only", () => {
  it("lets an employee GET the catalog mapping, but refuses PUT — an employee must not change the DIAN document type or seller by API", async () => {
    expect((await request("/api/catalog-mapping", "GET", EMPLOYEE)).status).toBe(200);
    const res = await request("/api/catalog-mapping", "PUT", EMPLOYEE);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "forbidden" } });
  });

  it("lets an admin PUT the catalog mapping", async () => {
    expect((await request("/api/catalog-mapping", "PUT", ADMIN)).status).toBe(200);
  });

  it("refuses an employee POST to credentials/health on every method — no session-only exception here, unlike emission-mode's GET", async () => {
    const res = await request("/api/credentials/health", "POST", EMPLOYEE);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: { code: "forbidden" } });
  });

  it("lets an admin POST to credentials/health", async () => {
    expect((await request("/api/credentials/health", "POST", ADMIN)).status).toBe(200);
  });
});

describe("middleware — unchanged baseline behaviour", () => {
  it("lets an employee reach the dashboard and the non-admin API routes", async () => {
    expect((await request("/", "GET", EMPLOYEE)).status).toBe(200);
    expect((await request("/api/invoices", "POST", EMPLOYEE)).status).toBe(200);
  });

  it("redirects an unauthenticated page request to /login instead of answering 401", async () => {
    const res = await request("/", "GET", null);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.local/login");
  });
});
