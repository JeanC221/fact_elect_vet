import { describe, expect, it, vi } from "vitest";
import {
  ROLE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  clearRoleCookie,
  clearSessionCookie,
  createRoleCookie,
  createSessionCookie,
} from "@/services/sessionCookies";

describe("session cookie", () => {
  it("createSessionCookie applies secure flags", () => {
    const cookie = createSessionCookie("abc");
    expect(cookie.name).toBe(SESSION_COOKIE_NAME);
    expect(cookie.value).toBe("abc");
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("strict");
    expect(cookie.path).toBe("/");
    expect(cookie.maxAge).toBe(28800); // A-3: 8h TTL, down from 24h
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

describe("role cookie (client-readable, UI display only)", () => {
  it("createRoleCookie maps the admin flag to a value", () => {
    expect(createRoleCookie(true).value).toBe("admin");
    expect(createRoleCookie(false).value).toBe("user");
  });

  it("createRoleCookie is non-HttpOnly and uses the role name", () => {
    const cookie = createRoleCookie(true);
    expect(cookie.name).toBe(ROLE_COOKIE_NAME);
    expect(cookie.httpOnly).toBe(false);
    expect(cookie.sameSite).toBe("strict");
    expect(cookie.path).toBe("/");
    expect(cookie.maxAge).toBe(28800); // A-3: 8h TTL, down from 24h
  });

  it("createRoleCookie secure flag toggles with NODE_ENV", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(createRoleCookie(true).secure).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(createRoleCookie(false).secure).toBe(false);
    vi.unstubAllEnvs();
  });

  it("clearRoleCookie expires immediately and is non-HttpOnly", () => {
    const cookie = clearRoleCookie();
    expect(cookie.name).toBe(ROLE_COOKIE_NAME);
    expect(cookie.value).toBe("");
    expect(cookie.maxAge).toBe(0);
    expect(cookie.httpOnly).toBe(false);
  });
});
