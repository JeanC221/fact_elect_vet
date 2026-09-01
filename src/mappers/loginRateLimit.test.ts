import { describe, it, expect } from "vitest";
import {
  EMPTY_STATE,
  MAX_ATTEMPTS,
  WINDOW_MS,
  LOCKOUT_MS,
  isLockedOut,
  lockoutSecondsRemaining,
  recordFailure,
  recordSuccess,
} from "./loginRateLimit";

const T0 = 1_700_000_000_000; // fixed epoch ms for deterministic tests

describe("isLockedOut", () => {
  it("is false for a fresh email with no attempts", () => {
    expect(isLockedOut(EMPTY_STATE, T0)).toBe(false);
  });

  it("is true while now is before lockedUntil", () => {
    const state = { attempts: [], lockedUntil: T0 + 60_000 };
    expect(isLockedOut(state, T0)).toBe(true);
  });

  it("is false once now reaches lockedUntil", () => {
    const state = { attempts: [], lockedUntil: T0 + 60_000 };
    expect(isLockedOut(state, T0 + 60_000)).toBe(false);
    expect(isLockedOut(state, T0 + 60_001)).toBe(false);
  });

  it("is false when lockedUntil is null even if attempts exist", () => {
    const state = { attempts: [T0, T0 + 1000], lockedUntil: null };
    expect(isLockedOut(state, T0 + 2000)).toBe(false);
  });
});

describe("lockoutSecondsRemaining", () => {
  it("is 0 when not locked out", () => {
    expect(lockoutSecondsRemaining(EMPTY_STATE, T0)).toBe(0);
  });

  it("rounds up to the nearest second while locked", () => {
    const state = { attempts: [], lockedUntil: T0 + 90_500 }; // 90.5s remaining
    expect(lockoutSecondsRemaining(state, T0)).toBe(91);
  });

  it("is 0 immediately after the lockout expires", () => {
    const state = { attempts: [], lockedUntil: T0 + 1000 };
    expect(lockoutSecondsRemaining(state, T0 + 1000)).toBe(0);
  });
});

describe("recordFailure", () => {
  it("appends a single failure without triggering a lockout below the threshold", () => {
    const next = recordFailure(EMPTY_STATE, T0);
    expect(next.attempts).toEqual([T0]);
    expect(next.lockedUntil).toBeNull();
  });

  it("accumulates attempts across calls within the window", () => {
    let state = EMPTY_STATE;
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      state = recordFailure(state, T0 + i * 1000);
    }
    expect(state.attempts).toHaveLength(MAX_ATTEMPTS - 1);
    expect(state.lockedUntil).toBeNull();
  });

  it("triggers a lockout exactly on the MAX_ATTEMPTS-th failure within the window", () => {
    let state = EMPTY_STATE;
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      state = recordFailure(state, T0 + i * 1000);
    }
    const now = T0 + (MAX_ATTEMPTS - 1) * 1000;
    state = recordFailure(state, now);
    expect(state.attempts).toHaveLength(MAX_ATTEMPTS);
    expect(state.lockedUntil).toBe(now + LOCKOUT_MS);
  });

  it("drops attempts older than WINDOW_MS before counting — old failures don't count toward a new lockout", () => {
    // 4 failures long ago (outside the window), then 1 recent one: should NOT lock out.
    const old = T0;
    let state: typeof EMPTY_STATE = { attempts: [old, old + 1, old + 2, old + 3], lockedUntil: null };
    const recentNow = old + WINDOW_MS + 1000; // just past the window
    state = recordFailure(state, recentNow);
    expect(state.attempts).toEqual([recentNow]); // old ones pruned
    expect(state.lockedUntil).toBeNull();
  });

  it("extends into a fresh lockout cycle after the window slides past old attempts", () => {
    const old = T0;
    let state: typeof EMPTY_STATE = { attempts: [old, old + 1, old + 2, old + 3], lockedUntil: null };
    const base = old + WINDOW_MS + 1000;
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      state = recordFailure(state, base + i * 1000);
    }
    expect(state.lockedUntil).toBeNull(); // only 4 recent attempts so far
    const finalNow = base + (MAX_ATTEMPTS - 1) * 1000;
    state = recordFailure(state, finalNow);
    expect(state.lockedUntil).toBe(finalNow + LOCKOUT_MS);
  });
});

describe("recordSuccess", () => {
  it("resets to the empty state regardless of prior failures", () => {
    const dirty = { attempts: [T0, T0 + 1, T0 + 2], lockedUntil: T0 + 60_000 };
    expect(recordSuccess()).toEqual(EMPTY_STATE);
    void dirty; // recordSuccess takes no args by design — success always fully clears
  });
});