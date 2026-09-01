export const MAX_ATTEMPTS = 5;
export const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

/** Persisted failed-attempt record for one email. */
export interface RateLimitState {
  /** Failure timestamps (ms epoch) within the current window, oldest first. */
  attempts: number[];
  /** Set when a lockout is active; null once expired/never triggered. */
  lockedUntil: number | null;
}

export const EMPTY_STATE: RateLimitState = { attempts: [], lockedUntil: null };

/** Whether a login attempt should be blocked right now, given the persisted state and current time. */
export function isLockedOut(state: RateLimitState, now: number): boolean {
  return state.lockedUntil !== null && now < state.lockedUntil;
}

/** Seconds remaining in the lockout, rounded up; 0 if not locked. */
export function lockoutSecondsRemaining(state: RateLimitState, now: number): number {
  if (!isLockedOut(state, now)) return 0;
  return Math.ceil((state.lockedUntil! - now) / 1000);
}

export function recordFailure(state: RateLimitState, now: number): RateLimitState {
  const recent = state.attempts.filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  const lockedUntil = recent.length >= MAX_ATTEMPTS ? now + LOCKOUT_MS : state.lockedUntil;
  return { attempts: recent, lockedUntil };
}

/** Reset on successful login — clears the record entirely for that email. */
export function recordSuccess(): RateLimitState {
  return EMPTY_STATE;
}