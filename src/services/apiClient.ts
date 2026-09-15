/**
 * H-8 — thin `fetch` wrapper that removes only the boilerplate every one of
 * the 18 raw `fetch` call sites duplicated identically: header construction
 * and JSON.parse-or-null.
 *
 * Deliberately does NOT retry, does NOT validate against a schema, and does
 * NOT throw on a non-2xx status — the 18 call sites branch on
 * 409/503/403 differently, and some need `retryWithBackoff` plus an
 * idempotency key while others are fire-and-forget (see the H-8 inventory in
 * PROJECT_STATE.md). Centralizing those here would either hide those
 * differences or force every caller through the least common shape.
 *
 * JSON parsing is lenient by design (`.catch(() => null)`), matching how
 * most call sites already read error bodies in this project. A caller on a
 * legally-critical success path (Siigo invoice/credit-note emission) MUST
 * still check `data === null` on `ok === true` and throw explicitly — this
 * wrapper will not do that for you, per "fail loudly, never silently".
 *
 * A network failure (offline, DNS, CORS) still rejects the returned
 * promise — every call site already wraps its call in try/catch.
 */
export interface ApiRequestOptions {
  method?: string;
  /** Object/array → `JSON.stringify`'d. String → sent verbatim (callers that already serialize keep control of their own encoding). */
  body?: unknown;
  /** Sent as the `X-Idempotency-Key` header. */
  idempotencyKey?: string;
  cache?: RequestCache;
  headers?: Record<string, string>;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  /** Parsed JSON body, or null if the response had no body / was not valid JSON. */
  data: T | null;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { ...options.headers };
  let body: string | undefined;
  if (options.body !== undefined) {
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    if (!("Content-Type" in headers)) headers["Content-Type"] = "application/json";
  }
  if (options.idempotencyKey) headers["X-Idempotency-Key"] = options.idempotencyKey;

  const res = await fetch(path, {
    method: options.method,
    headers: Object.keys(headers).length ? headers : undefined,
    body,
    cache: options.cache,
  });

  const data = (await res.json().catch(() => null)) as T | null;
  return { ok: res.ok, status: res.status, data };
}
