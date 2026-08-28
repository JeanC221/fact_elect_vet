import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthError, authenticate } from "@/services/auth";
import { verifySessionToken } from "@/services/jwt";

/**
 * Multi-role authentication: a SEPARATE admin account (ADMIN_EMAIL +
 * ADMIN_PASSWORD) and receptionist account (EMPLOYEE_EMAIL +
 * EMPLOYEE_PASSWORD). Passwords are stored as plain text; the service
 * hashes them at runtime via SHA-256.
 */

describe("authenticate (multi-role: admin + receptionist)", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret-key-0123456789";
    process.env.EMPLOYEE_EMAIL = "recepcion@vet.com";
    process.env.EMPLOYEE_PASSWORD = "S3gura#123";
    process.env.ADMIN_EMAIL = "admin@vet.com";
    process.env.ADMIN_PASSWORD = "Adm1n#2026";
  });
  afterEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.EMPLOYEE_EMAIL;
    delete process.env.EMPLOYEE_PASSWORD;
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
  });

  it("logs in the administrator with admin=true", async () => {
    const { token, admin } = await authenticate("admin@vet.com", "Adm1n#2026");
    expect(admin).toBe(true);
    const payload = await verifySessionToken(token);
    expect(payload?.admin).toBe(true);
    expect(payload?.email).toBe("admin@vet.com");
  });

  it("logs in the receptionist with admin=false", async () => {
    const { token, admin } = await authenticate("recepcion@vet.com", "S3gura#123");
    expect(admin).toBe(false);
    const payload = await verifySessionToken(token);
    expect(payload?.admin).toBe(false);
    expect(payload?.email).toBe("recepcion@vet.com");
  });

  it("accepts the admin email regardless of case + surrounding whitespace", async () => {
    const { admin } = await authenticate("  Admin@VET.com ", "Adm1n#2026");
    expect(admin).toBe(true);
  });

  it("rejects the administrator account with the wrong password", async () => {
    await expect(authenticate("admin@vet.com", "wrongpass")).rejects.toMatchObject({
      code: "invalid_credentials",
    });
  });

  it("rejects the receptionist account with the wrong password", async () => {
    await expect(authenticate("recepcion@vet.com", "wrongpass")).rejects.toMatchObject({
      code: "invalid_credentials",
    });
  });

  it("does not let the receptionist password unlock the admin account", async () => {
    await expect(authenticate("admin@vet.com", "S3gura#123")).rejects.toBeInstanceOf(AuthError);
  });

  it("falls back to invalid_credentials when only the receptionist set is configured", async () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    await expect(authenticate("admin@vet.com", "Adm1n#2026")).rejects.toMatchObject({
      code: "invalid_credentials",
    });
  });

  it("throws missing_credentials when both credential sets are unset", async () => {
    delete process.env.EMPLOYEE_EMAIL;
    delete process.env.EMPLOYEE_PASSWORD;
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    await expect(authenticate("a@b.com", "password123")).rejects.toMatchObject({
      code: "missing_credentials",
    });
  });

  it("throws missing_credentials when JWT_SECRET is unset", async () => {
    delete process.env.JWT_SECRET;
    await expect(authenticate("admin@vet.com", "Adm1n#2026")).rejects.toMatchObject({
      code: "missing_credentials",
    });
  });
});
