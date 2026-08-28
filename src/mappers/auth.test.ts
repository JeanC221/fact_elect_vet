import { describe, expect, it } from "vitest";
import {
  AUTH_ERROR_MESSAGES,
  authErrorToSpanish,
  loginFormSchema,
  type LoginFormValues,
} from "@/mappers/auth";

describe("loginFormSchema", () => {
  const valid: LoginFormValues = { email: "recepcion@vetclinic.com", password: "S3gura#123" };

  it("parses a valid email + password", () => {
    expect(loginFormSchema.parse(valid)).toEqual(valid);
  });

  it("rejects a malformed email", () => {
    expect(() => loginFormSchema.parse({ ...valid, email: "no-arroba" })).toThrow();
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(() => loginFormSchema.parse({ ...valid, password: "abc123" })).toThrow();
  });

  it("trims surrounding whitespace on email and password", () => {
    const parsed = loginFormSchema.parse({ email: "  user@vet.com  ", password: "  password123  " });
    expect(parsed.email).toBe("user@vet.com");
    expect(parsed.password).toBe("password123");
  });
});

describe("authErrorToSpanish", () => {
  it("maps invalid_credentials to a Spanish message", () => {
    expect(authErrorToSpanish("invalid_credentials")).toBe(AUTH_ERROR_MESSAGES.invalid_credentials);
  });

  it("maps missing_credentials to a Spanish message", () => {
    expect(authErrorToSpanish("missing_credentials")).toBe(AUTH_ERROR_MESSAGES.missing_credentials);
  });

  it("maps rate_limited to a Spanish message", () => {
    expect(authErrorToSpanish("rate_limited")).toBe(AUTH_ERROR_MESSAGES.rate_limited);
  });

  it("falls back to default message for unknown codes", () => {
    expect(authErrorToSpanish("unknown_code")).toBe(AUTH_ERROR_MESSAGES.default);
    expect(authErrorToSpanish("")).toBe(AUTH_ERROR_MESSAGES.default);
  });

  it("never exposes raw stack traces", () => {
    const msg = authErrorToSpanish("invalid_credentials");
    expect(msg).not.toMatch(/Error|at\s.*\d|stack/i);
  });
});
