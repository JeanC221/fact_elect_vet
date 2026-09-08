import { NextRequest } from "next/server";
import { signSessionToken } from "@/services/jwt";
import { SESSION_COOKIE_NAME } from "@/services/sessionCookies";

/**
 * Shared test fixture for building a `NextRequest` that carries (or omits) a
 * real, signed session cookie.
 *
 * Deliberately imports NOTHING from `vitest`: this file is inert at build time
 * and is excluded from the suite by `vitest.config.ts` (`include:
 * ["src/**\/*.test.ts"]`), so it is never collected as a test. It exists
 * because D0 adds a session guard to 13 route handlers, and duplicating the
 * signing harness across 11 test files would violate .clinerules ZERO
 * DUPLICATION. The harness itself is the one already proven in
 * `middleware.test.ts` — a signed JWT in a `cookie` header, nothing mocked.
 *
 * Known `ts-prune` false positive: consumed only by `*.test.ts` files, so a
 * production-only reachability scan reports it as dead code. It is not.
 *
 * Callers must set `process.env.JWT_SECRET = TEST_JWT_SECRET` in `beforeAll`,
 * because `signSessionToken` reads the secret at call time.
 */

/** Test-only signing secret. Never a real key; ≥16 chars per `jwt.getSecret`. */
export const TEST_JWT_SECRET = "route-guard-test-secret-not-a-real-key";

/** Receptionist role: valid session, `admin: false`. */
export const EMPLOYEE_SESSION = { email: "recepcion@clinica.co", admin: false };

/** Clinic owner role: valid session, `admin: true`. */
export const ADMIN_SESSION = { email: "admin@clinica.co", admin: true };

/** Origin used for every fabricated request; mirrors `middleware.test.ts`. */
const TEST_ORIGIN = "https://app.local";

interface RequestInitOptions {
  /** HTTP verb. Defaults to GET. */
  method?: string;
  /** Optional JSON body; serialised and sent with `content-type: application/json`. */
  body?: unknown;
}

function buildRequest(path: string, options: RequestInitOptions, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  const init: { method: string; headers: Headers; body?: string } = {
    method: options.method ?? "GET",
    headers,
  };
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(options.body);
  }
  return new NextRequest(new URL(`${TEST_ORIGIN}${path}`), init);
}

/** A request with no session cookie at all — the anonymous caller. */
export function anonymousRequest(path: string, options: RequestInitOptions = {}): NextRequest {
  return buildRequest(path, options);
}

/** A request carrying a genuinely signed session cookie for `session`. */
export async function sessionRequest(
  path: string,
  session: { email: string; admin: boolean },
  options: RequestInitOptions = {},
): Promise<NextRequest> {
  const token = await signSessionToken(session);
  return buildRequest(path, options, `${SESSION_COOKIE_NAME}=${token}`);
}

/**
 * Sign a session and return the ready-to-set `cookie` header value.
 * Handler tests call this once in `beforeAll` and then build requests
 * synchronously with `requestWithCookie`, because their existing helpers
 * (`deleteRequest(query)`, `postRequest(body)`) are synchronous and rewriting
 * every one of them as async would change far more than D0 needs to.
 */
export async function issueSessionCookie(session: {
  email: string;
  admin: boolean;
}): Promise<string> {
  return `${SESSION_COOKIE_NAME}=${await signSessionToken(session)}`;
}

/** Synchronous `NextRequest` builder for a cookie already issued above. */
export function requestWithCookie(
  url: string,
  cookie: string,
  init: RequestInit = {},
): NextRequest {
  if (!cookie) {
    throw new Error(
      "requestWithCookie recibió una cookie vacía: ¿se construyó el request en " +
        "el ámbito del módulo, antes de que beforeAll emitiera la sesión?",
    );
  }
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  // Only method/body/headers are forwarded on purpose: `RequestInit.signal`
  // allows null while `NextRequest` does not, and no handler test needs it.
  return new NextRequest(new URL(url), {
    method: init.method,
    body: init.body ?? undefined,
    headers,
  });
}

/** A request whose cookie is present but not a valid token — tampering case. */
export function tamperedSessionRequest(
  path: string,
  options: RequestInitOptions = {},
): NextRequest {
  return buildRequest(path, options, `${SESSION_COOKIE_NAME}=not.a.jwt`);
}
