import { describe, it, expect } from "vitest";
import {
  parseCachedMode,
  resolveEmissionGate,
  type CachedModeRead,
} from "./emissionModeState";

/**
 * The asymmetry encoded here is the whole point of the module, so it is
 * stated once: a wrongly-cached `sandbox` sets `stamp.send: false` and
 * produces an invoice that is never stamped at the DIAN — a silent failure
 * that yields a legally void document, and one that cannot even be annulled
 * with a credit note until it is stamped. A wrongly-cached `production` sends
 * `stamp.send: true` against a sandbox account, which Siigo refuses with
 * `document_settings` — a loud failure the operator sees immediately.
 *
 * Blocking on unconfirmed `sandbox` is therefore correct; blocking on
 * unconfirmed `production` would stop the clinic invoicing to prevent the
 * lesser of the two failures.
 */

const CACHED = (mode: "sandbox" | "production"): CachedModeRead => ({ source: "cache", mode });

describe("parseCachedMode — distinguishes a confirmed value from a default", () => {
  it("reads a stored sandbox as a real cached value, not as a default", () => {
    const raw = JSON.stringify({ mode: "sandbox", configured: {}, updatedAt: "2026-09-01T00:00:00.000Z" });
    expect(parseCachedMode(raw)).toEqual({ source: "cache", mode: "sandbox" });
  });

  it("reads a stored production", () => {
    const raw = JSON.stringify({ mode: "production", configured: { partnerId: true }, updatedAt: "2026-09-01T00:00:00.000Z" });
    expect(parseCachedMode(raw)).toEqual({ source: "cache", mode: "production" });
  });

  it("reports an absent key as `absent`, never as a cached sandbox", () => {
    expect(parseCachedMode(null)).toEqual({ source: "absent" });
    expect(parseCachedMode("")).toEqual({ source: "absent" });
  });

  it("reports a corrupt blob as `corrupt`, never as a cached sandbox", () => {
    expect(parseCachedMode("{not json")).toEqual({ source: "corrupt" });
    expect(parseCachedMode(JSON.stringify({ mode: "not-a-mode", configured: {}, updatedAt: "x" }))).toEqual({ source: "corrupt" });
    expect(parseCachedMode(JSON.stringify({ mode: "sandbox" }))).toEqual({ source: "corrupt" });
  });
});

describe("resolveEmissionGate — while the mode is still loading", () => {
  it("blocks emission before the request has settled, whatever the cache says", () => {
    const gate = resolveEmissionGate({ settled: false, serverMode: null, cached: CACHED("production") });
    expect(gate).toMatchObject({ canEmit: false, modeConfirmed: false, reason: "loading" });
  });
});

describe("resolveEmissionGate — server answered", () => {
  it("confirms and allows when the server returned production", () => {
    const gate = resolveEmissionGate({ settled: true, serverMode: "production", cached: CACHED("sandbox") });
    expect(gate).toMatchObject({ mode: "production", modeConfirmed: true, canEmit: true, reason: "confirmed" });
  });

  it("confirms and allows when the server returned sandbox — a confirmed sandbox is a fact, not a default", () => {
    const gate = resolveEmissionGate({ settled: true, serverMode: "sandbox", cached: { source: "absent" } });
    expect(gate).toMatchObject({ mode: "sandbox", modeConfirmed: true, canEmit: true, reason: "confirmed" });
  });

  it("lets the server override a stale cache", () => {
    const gate = resolveEmissionGate({ settled: true, serverMode: "sandbox", cached: CACHED("production") });
    expect(gate.mode).toBe("sandbox");
  });
});

describe("resolveEmissionGate — server unreachable (503 / network)", () => {
  it("BLOCKS on a cached sandbox: the real mode could be production, and emitting unstamped fails silently", () => {
    const gate = resolveEmissionGate({ settled: true, serverMode: null, cached: CACHED("sandbox") });
    expect(gate).toMatchObject({ mode: "sandbox", modeConfirmed: false, canEmit: false, reason: "cached_sandbox" });
  });

  it("ALLOWS on a cached production with a warning: the wrong-way failure is a loud Siigo rejection", () => {
    const gate = resolveEmissionGate({ settled: true, serverMode: null, cached: CACHED("production") });
    expect(gate).toMatchObject({ mode: "production", modeConfirmed: false, canEmit: true, reason: "cached_production" });
  });

  it("BLOCKS when there is no cache at all — a new device, incognito or cleared cache", () => {
    const gate = resolveEmissionGate({ settled: true, serverMode: null, cached: { source: "absent" } });
    expect(gate).toMatchObject({ mode: "sandbox", modeConfirmed: false, canEmit: false, reason: "unconfirmed" });
  });

  it("BLOCKS on a corrupt cache rather than reading its sandbox fallback as a decision", () => {
    const gate = resolveEmissionGate({ settled: true, serverMode: null, cached: { source: "corrupt" } });
    expect(gate).toMatchObject({ canEmit: false, reason: "unconfirmed" });
  });

  it("BLOCKS during SSR, where no cache can be read at all", () => {
    const gate = resolveEmissionGate({ settled: true, serverMode: null, cached: { source: "ssr" } });
    expect(gate).toMatchObject({ canEmit: false, reason: "unconfirmed" });
  });
});

describe("resolveEmissionGate — mode fallback never invents a value", () => {
  it("falls back to sandbox for the mode field when nothing is known, but never reports it as confirmed", () => {
    for (const source of ["absent", "corrupt", "ssr"] as const) {
      const gate = resolveEmissionGate({ settled: true, serverMode: null, cached: { source } });
      expect(gate.mode, `${source} keeps the historical sandbox default`).toBe("sandbox");
      expect(gate.modeConfirmed, `${source} must never be confirmed`).toBe(false);
    }
  });

  it("only ever reports modeConfirmed when the server actually answered", () => {
    const confirmed = resolveEmissionGate({ settled: true, serverMode: "production", cached: { source: "absent" } });
    const unconfirmed = resolveEmissionGate({ settled: true, serverMode: null, cached: CACHED("production") });
    expect(confirmed.modeConfirmed).toBe(true);
    expect(unconfirmed.modeConfirmed).toBe(false);
  });
});
