import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  translateSiigoError,
  isRetryable,
  calculateBackoff,
  retryWithBackoff,
} from "./errorTranslator";
import { SiigoApiError } from "./siigoApi";

describe("translateSiigoError", () => {
  it("maps invalid_identification to error/edit_identification/non-retryable", () => {
    const r = translateSiigoError(new SiigoApiError("invalid_identification", "x"));
    expect(r).toMatchObject({ code: "invalid_identification", severity: "error", quickAction: "edit_identification", retryable: false });
    expect(r.message).toContain("cédula");
  });

  it("maps invalid_total_payments to error/edit_payments/non-retryable", () => {
    const r = translateSiigoError(new SiigoApiError("invalid_total_payments", "x"));
    expect(r).toMatchObject({ severity: "error", quickAction: "edit_payments", retryable: false });
  });

  it("maps parameter_required to error/edit_email/non-retryable", () => {
    const r = translateSiigoError(new SiigoApiError("parameter_required", "x"));
    expect(r).toMatchObject({
      severity: "error",
      quickAction: "edit_email",
      retryable: false,
    });
  });

  it("maps requests_limit to warning/auto_retry/retryable", () => {
    const r = translateSiigoError(new SiigoApiError("requests_limit", "x"));
    expect(r).toMatchObject({
      severity: "warning",
      quickAction: "auto_retry",
      retryable: true,
    });
  });

  it("maps service_unavailable to warning/save_draft/retryable", () => {
    const r = translateSiigoError(new SiigoApiError("service_unavailable", "x"));
    expect(r).toMatchObject({ severity: "warning", quickAction: "save_draft", retryable: true });
  });

  it("falls back to default for unknown SiigoApiError codes", () => {
    const r = translateSiigoError(new SiigoApiError("unknown_code", "x"));
    expect(r).toMatchObject({
      code: "unknown_code",
      severity: "error",
      quickAction: "none",
      retryable: false,
    });
  });

  it("falls back to default for non-SiigoApiError exceptions", () => {
    expect(translateSiigoError(new Error("raw"))).toMatchObject({
      code: "default",
      severity: "error",
    });
  });

  it("falls back to default for null/undefined", () => {
    expect(translateSiigoError(null).code).toBe("default");
    expect(translateSiigoError(undefined).code).toBe("default");
  });
});

describe("isRetryable", () => {
  it("returns true for transient codes", () => {
    expect(isRetryable("requests_limit")).toBe(true);
    expect(isRetryable("service_unavailable")).toBe(true);
  });

  it("returns false for non-retryable codes", () => {
    expect(isRetryable("invalid_identification")).toBe(false);
    expect(isRetryable("default")).toBe(false);
  });
});

describe("calculateBackoff", () => {
  it("returns ~1000ms for attempt 0 (±500 jitter)", () => {
    const d = calculateBackoff(0);
    expect(d).toBeGreaterThanOrEqual(1000);
    expect(d).toBeLessThanOrEqual(1500);
  });

  it("grows exponentially: attempt 1 ~2000ms, attempt 2 ~4000ms", () => {
    expect(calculateBackoff(1)).toBeGreaterThanOrEqual(2000);
    expect(calculateBackoff(1)).toBeLessThanOrEqual(2500);
    expect(calculateBackoff(2)).toBeGreaterThanOrEqual(4000);
    expect(calculateBackoff(2)).toBeLessThanOrEqual(4500);
  });

  it("returns -1 when attempt >= maxRetries", () => {
    expect(calculateBackoff(5)).toBe(-1);
    expect(calculateBackoff(10)).toBe(-1);
  });

  it("respects custom maxRetries", () => {
    expect(calculateBackoff(3, 3)).toBe(-1);
    expect(calculateBackoff(2, 3)).toBeGreaterThanOrEqual(0);
  });
});

describe("retryWithBackoff", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("returns immediately on first-attempt success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const onRetry = vi.fn();
    const result = await retryWithBackoff(fn, { maxRetries: 3, onRetry });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("retries on retryable errors and succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new SiigoApiError("requests_limit", "rate")).mockResolvedValue("ok");
    const onRetry = vi.fn();
    const promise = retryWithBackoff(fn, { maxRetries: 3, onRetry });
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("throws immediately on non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new SiigoApiError("invalid_identification", "bad"));
    await expect(retryWithBackoff(fn, { maxRetries: 3 })).rejects.toMatchObject({ code: "invalid_identification" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting max retries", async () => {
    const err = new SiigoApiError("service_unavailable", "down");
    const fn = vi.fn().mockRejectedValue(err);
    const onRetry = vi.fn();
    // Catch immediately to prevent unhandled rejection
    const promise = retryWithBackoff(fn, { maxRetries: 2, onRetry }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10000);
    const result = await promise;
    expect(result).toMatchObject({ code: "service_unavailable" });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});
