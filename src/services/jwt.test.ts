import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "@/services/jwt";

describe("session token (Web Crypto JWT)", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret-key-0123456789";
  });
  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it("round-trips a valid token", async () => {
    const token = await signSessionToken({ email: "user@vet.com" });
    const payload = await verifySessionToken(token);
    expect(payload?.email).toBe("user@vet.com");
    expect(payload?.exp).toBeGreaterThan(payload!.iat);
  });

  it("defaults admin to false when omitted", async () => {
    const token = await signSessionToken({ email: "user@vet.com" });
    expect((await verifySessionToken(token))?.admin).toBe(false);
  });

  it("round-trips the admin flag when set", async () => {
    const token = await signSessionToken({ email: "user@vet.com", admin: true });
    expect((await verifySessionToken(token))?.admin).toBe(true);
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
    // Forge a validly-signed token whose exp is already in the past.
    const body = { email: "user@vet.com", admin: false, iat: now - 100, exp: now - 10 };
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
