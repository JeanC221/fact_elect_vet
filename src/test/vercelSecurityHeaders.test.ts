import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `vercel.json` is invisible to every other gate in this project: it is not
 * type-checked, not bundled, not executed by `next build`, and not loaded by
 * any other test. A CSP that is deleted, misspelled or JSON-broken would ship
 * silently. This file is the only thing standing between that and production.
 *
 * It deliberately asserts SHAPE, not browser behaviour. No test in a Node
 * environment can prove a policy does not break the app — that verification is
 * manual, in a preview deployment, with DevTools open. Adding jsdom to fake it
 * is a rejected project decision, and this comment is the documented debt.
 */
const vercelConfig = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "vercel.json"), "utf8"),
) as {
  framework: string;
  regions: string[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};

const rule = vercelConfig.headers[0];
const byKey = new Map(rule.headers.map((h) => [h.key, h.value]));

/** Phase 1 = report-only. Phase 2 flips this to "Content-Security-Policy". */
const CSP_KEY = "Content-Security-Policy-Report-Only";

describe("vercel.json security headers", () => {
  it("keeps a single catch-all rule whose source covers every path", () => {
    expect(vercelConfig.headers).toHaveLength(1);
    expect(rule.source).toBe("/(.*)");
  });

  it("does not lose the deployment settings", () => {
    expect(vercelConfig.framework).toBe("nextjs");
    expect(vercelConfig.regions).toEqual(["iad1"]);
  });

  it("keeps the five pre-existing headers untouched", () => {
    expect(byKey.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(byKey.get("X-Frame-Options")).toBe("DENY");
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(byKey.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  it("ships exactly one CSP header, and it is the report-only one", () => {
    const cspKeys = [...byKey.keys()].filter((k) => /content-security-policy/i.test(k));
    expect(cspKeys).toEqual([CSP_KEY]);
  });

  it("declares every directive the audited surface needs", () => {
    const directives = new Map(
      (byKey.get(CSP_KEY) ?? "")
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const [name, ...sources] = d.split(/\s+/);
          return [name, sources] as const;
        }),
    );

    expect([...directives.keys()].sort()).toEqual(
      [
        "base-uri",
        "connect-src",
        "default-src",
        "font-src",
        "form-action",
        "frame-ancestors",
        "img-src",
        "object-src",
        "script-src",
        "style-src",
        "upgrade-insecure-requests",
      ].sort(),
    );

    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("connect-src")).toEqual(["'self'"]);
    expect(directives.get("font-src")).toEqual(["'self'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives.get("base-uri")).toEqual(["'self'"]);
    expect(directives.get("form-action")).toEqual(["'self'"]);
    expect(directives.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
  });

  it("allows inline script and style, which the 4 prerendered pages require", () => {
    // Measured on commit 2f29a24: a nonce policy leaves 5 un-nonced inline
    // <script> tags in the prerendered HTML of every "○" page, including "/".
    const csp = byKey.get(CSP_KEY) ?? "";
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("does not allow eval, and carries no nonce or strict-dynamic", () => {
    const csp = byKey.get(CSP_KEY) ?? "";
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("nonce-");
    expect(csp).not.toContain("'strict-dynamic'");
  });

  it("names no external origin", () => {
    expect(byKey.get(CSP_KEY) ?? "").not.toMatch(/https?:\/\//);
  });
});
