import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthError,
  SESSION_COOKIE_NAME,
  authenticateEmployee,
  clearSessionCookie,
  createSessionCookie,
  signSessionToken,
  verifySessionToken,
} from "@/services/auth";

describe("session token (Web Crypto JWT)", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret-key-0123456789";
  });
  afterEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.EMPLOYEE_EMAIL;
    delete process.env.EMPLOYEE_PASSWORD_HASH;
  });

  it("round-trips a valid token", async () => {
    const token = await signSessionToken({ email: "user@vet.com" });
    const payload = await verifySessionToken(token);
    expect(payload?.email).toBe("user@vet.com");
    expect(payload?.exp).toBeGreaterThan(payload!.iat);
  });

  it("rejects a tampered token (signature mismatch)", async () => {
    const token = await signSessionToken({ email: "user@vet.com" });
    const tampered = `${token.slice(0, -3)}AAA`;
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("rejects a token with fewer than 3 parts", async () => {
    expect(await verifySessionToken("a.b")).toBeNull();
    expect(await verifySessionToken("garbage")).toBeNull();
  });

  it("rejects an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    // Manually craft an expired-but-validly-signed token by signing a payload
    // with past expiry via the public signer is not possible (24h), so verify
    // the expiry guard by forging a token whose exp is already in the past.
    const body = { email: "user@vet.com", iat: now - 100, exp: now - 10 };
    const headerB64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(body)).toString("base64url");
    const data = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(process.env.JWT_SECRET!),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = Buffer.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)))).toString("base64url");
    expect(await verifySessionToken(`${data}.${sig}`)).toBeNull();
  });
});

describe("session cookies", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret-key-0123456789";
  });

  it("createSessionCookie applies secure flags", async () => {
    const token = await signSessionToken({ email: "u@v.com" });
    const cookie = createSessionCookie(token);
    expect(cookie.name).toBe(SESSION_COOKIE_NAME);
    expect(cookie.value).toBe(token);
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("strict");
    expect(cookie.path).toBe("/");
    expect(cookie.maxAge).toBe(86400);
  });

  it("createSessionCookie secure flag toggles with NODE_ENV", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(createSessionCookie("x").secure).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(createSessionCookie("x").secure).toBe(false);
    vi.unstubAllEnvs();
  });

  it("clearSessionCookie expires immediately (maxAge=0)", () => {
    const cookie = clearSessionCookie();
    expect(cookie.name).toBe(SESSION_COOKIE_NAME);
    expect(cookie.value).toBe("");
    expect(cookie.maxAge).toBe(0);
    expect(cookie.httpOnly).toBe(true);
  });
});

describe("authenticateEmployee", () => {
  beforeEach(async () => {
    process.env.JWT_SECRET = "test-secret-key-0123456789";
    process.env.EMPLOYEE_EMAIL = "recepcion@vet.com";
    // sha256("S3gura#123") base64url
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("S3gura#123"));
    process.env.EMPLOYEE_PASSWORD_HASH = Buffer.from(new Uint8Array(digest)).toString("base64url");
  });

  it("returns a valid token on correct credentials", async () => {
    const token = await authenticateEmployee("recepcion@vet.com", "S3gura#123");
    const payload = await verifySessionToken(token);
    expect(payload?.email).toBe("recepcion@vet.com");
  });

  it("accepts email regardless of case + surrounding whitespace", async () => {
    const token = await authenticateEmployee("  Recepcion@VET.com ", "S3gura#123");
    expect(await verifySessionToken(token)).not.toBeNull();
  });

  it("throws AuthError invalid_credentials on wrong password", async () => {
    await expect(authenticateEmployee("recepcion@vet.com", "wrongpass")).rejects.toMatchObject({
      code: "invalid_credentials",
    });
  });

  it("throws AuthError invalid_credentials on wrong email", async () => {
    await expect(authenticateEmployee("otro@vet.com", "S3gura#123")).rejects.toBeInstanceOf(AuthError);
  });

  it("throws AuthError missing_credentials when env unset", async () => {
    delete process.env.EMPLOYEE_EMAIL;
    delete process.env.EMPLOYEE_PASSWORD_HASH;
    await expect(authenticateEmployee("a@b.com", "password123")).rejects.toMatchObject({
      code: "missing_credentials",
    });
  });
});
