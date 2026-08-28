import { describe, it, expect } from "vitest";
import {
  buildCredentialsRows,
  credentialsConfigSchema,
  credentialsSchema,
  CREDENTIAL_LABELS,
  environmentModeSchema,
  maskSecret,
  parseCredentialsConfig,
  SECRET_FIELDS,
  serializeCredentialsConfig,
  stampSendFor,
  type Credentials,
  type CredentialsConfig,
} from "./credentials";

const validCredentials: Credentials = {
  partnerId: "ABC123", username: "usuario@vet.com", accessKey: "secret-access-key",
  clientId: "client-id-value", clientSecret: "client-secret-value",
};

describe("credentialsSchema", () => {
  it("accepts a valid credentials payload", () => {
    expect(credentialsSchema.parse(validCredentials)).toEqual(validCredentials);
  });

  it("accepts Partner-Id at the 3-char minimum and 100-char maximum", () => {
    expect(
      credentialsSchema.parse({ ...validCredentials, partnerId: "abc" }).partnerId,
    ).toBe("abc");
    const max = "a".repeat(100);
    expect(
      credentialsSchema.parse({ ...validCredentials, partnerId: max }).partnerId,
    ).toBe(max);
  });

  it("rejects Partner-Id shorter than 3 chars", () => {
    const r = credentialsSchema.safeParse({ ...validCredentials, partnerId: "ab" });
    expect(r.success).toBe(false);
  });

  it("rejects Partner-Id longer than 100 chars", () => {
    const r = credentialsSchema.safeParse({
      ...validCredentials,
      partnerId: "a".repeat(101),
    });
    expect(r.success).toBe(false);
  });

  it("rejects Partner-Id with non-alphanumeric characters", () => {
    const r = credentialsSchema.safeParse({ ...validCredentials, partnerId: "ab-c" });
    expect(r.success).toBe(false);
  });

  it("rejects empty username, accessKey, clientId, clientSecret", () => {
    for (const field of ["username", "accessKey", "clientId", "clientSecret"] as (keyof Credentials)[]) {
      const r = credentialsSchema.safeParse({ ...validCredentials, [field]: "  " });
      expect(r.success).toBe(false);
    }
  });
});

describe("environmentModeSchema", () => {
  it("accepts sandbox and production only", () => {
    expect(environmentModeSchema.parse("sandbox")).toBe("sandbox");
    expect(environmentModeSchema.parse("production")).toBe("production");
  });

  it("rejects unknown modes", () => {
    expect(environmentModeSchema.safeParse("staging").success).toBe(false);
    expect(environmentModeSchema.safeParse("prod").success).toBe(false);
  });
});

describe("stampSendFor", () => {
  it("returns false for sandbox", () => {
    expect(stampSendFor("sandbox")).toBe(false);
  });
  it("returns true for production", () => {
    expect(stampSendFor("production")).toBe(true);
  });
});

describe("maskSecret", () => {
  it("masks with 8 bullets when configured and value present", () => {
    expect(maskSecret("real-secret", true)).toBe("••••••••");
  });
  it("returns empty when not configured", () => {
    expect(maskSecret("real-secret", false)).toBe("");
  });
  it("returns empty when configured but value blank", () => {
    expect(maskSecret("   ", true)).toBe("");
  });
});

describe("buildCredentialsRows", () => {
  const config: CredentialsConfig = {
    mode: "sandbox",
    configured: { partnerId: true, username: true, accessKey: true, clientId: false, clientSecret: false },
    updatedAt: "2026-08-26T00:00:00.000Z",
  };

  it("builds 5 rows in fixed order with labels", () => {
    const rows = buildCredentialsRows(config, validCredentials);
    const ids = ["partnerId", "username", "accessKey", "clientId", "clientSecret"] as const;
    expect(rows.map((r) => r.id)).toEqual(ids);
    expect(rows.map((r) => r.label)).toEqual(ids.map((id) => CREDENTIAL_LABELS[id]));
  });

  it("marks only accessKey and clientSecret as secret", () => {
    const rows = buildCredentialsRows(config, validCredentials);
    expect(rows.filter((r) => r.secret).map((r) => r.id)).toEqual(["accessKey", "clientSecret"]);
    expect(SECRET_FIELDS.has("partnerId")).toBe(false);
  });

  it("masks configured fields and leaves unconfigured empty", () => {
    const rows = buildCredentialsRows(config, validCredentials);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.partnerId.masked).toBe("••••••••");
    expect(byId.clientId.masked).toBe("");
  });
});

describe("serialize / parse credentialsConfig", () => {
  const config: CredentialsConfig = {
    mode: "production",
    configured: { partnerId: true, username: true, accessKey: true, clientId: true, clientSecret: true },
    updatedAt: "2026-08-26T00:00:00.000Z",
  };

  it("round-trips a valid config", () => {
    const parsed = parseCredentialsConfig(serializeCredentialsConfig(config));
    expect(parsed).toEqual(config);
  });

  it("rejects a corrupt JSON blob", () => {
    expect(() => parseCredentialsConfig("not-json{")).toThrow();
  });

  it("rejects an invalid config (bad mode)", () => {
    const bad = JSON.stringify({ ...config, mode: "staging" });
    expect(() => parseCredentialsConfig(bad)).toThrow();
  });

  it("credentialsConfigSchema carries no secret value fields", () => {
    const shape = credentialsConfigSchema.shape;
    expect(shape).not.toHaveProperty("partnerId");
    expect(shape).not.toHaveProperty("clientSecret");
  });
});
