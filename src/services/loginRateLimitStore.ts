import { put, get, BlobNotFoundError } from "@vercel/blob";
import { z } from "zod";
import { EMPTY_STATE, type RateLimitState } from "@/mappers/loginRateLimit";

/**
 * Per-email login rate-limit storage (Vercel Blob, private). One small JSON
 * blob per email — cheap to read/write and naturally self-cleans since old
 * attempts fall out of the sliding window on the next read (see
 * mappers/loginRateLimit.ts). A storage read/write failure here NEVER blocks
 * login — rate-limiting is a defense-in-depth layer, not the primary control
 * (that's the password check itself), so failing open is the correct
 * trade-off for an internal clinic tool.
 */

const rateLimitStateSchema = z.object({
  attempts: z.array(z.number()),
  lockedUntil: z.number().nullable(),
});

/** Stable, filesystem-safe key per email (case/whitespace-insensitive) — never the raw email in the path. */
async function blobPathFor(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `fact-vet/login-rate-limit/${hex}.json`;
}

/** Read the current rate-limit state for an email. Any failure (not found, corrupt, network) → EMPTY_STATE (fail open). */
export async function readRateLimitState(email: string): Promise<RateLimitState> {
  try {
    const path = await blobPathFor(email);
    const result = await get(path, { access: "private" });
    if (!result) return EMPTY_STATE;
    const raw = await new Response(result.stream).json();
    const parsed = rateLimitStateSchema.safeParse(raw);
    return parsed.success ? parsed.data : EMPTY_STATE;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return EMPTY_STATE;
    return EMPTY_STATE;
  }
}

/** Persist the rate-limit state for an email. Failures are swallowed — never blocks the login flow. */
export async function writeRateLimitState(email: string, state: RateLimitState): Promise<void> {
  try {
    const path = await blobPathFor(email);
    await put(path, JSON.stringify(state), {
      access: "private",
      contentType: "application/json",
      allowOverwrite: true,
    });
  } catch {
    // Storage unavailable — rate limiting silently no-ops for this request
    // rather than blocking a legitimate login attempt.
  }
}