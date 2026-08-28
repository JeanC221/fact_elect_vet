import { sanitizeText, type Identification } from "@/schemas/provet";

/** Remove dots, dashes and spaces from any identification raw value. */
function cleanIdChars(raw: string): string {
  return raw.replace(/[.\s]/g, "").replace(/-/g, "");
}

/**
 * Normalizes a raw identification string for Siigo:
 * strips dots, dashes and spaces, preserving the document type.
 */
export function cleanIdentification(
  type: Identification["type"],
  raw: string,
): Identification {
  return { type, number: cleanIdChars(raw) };
}

/** Splits a full name into a [firstname, lastname] tuple safe for Siigo. */
export function splitName(fullName: string): [string, string] {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ["Cliente", "sin nombre"];
  if (parts.length === 1) return [parts[0], parts[0]];
  const first = parts.slice(0, -1).join(" ");
  const last = parts[parts.length - 1] ?? "";
  return [first, last];
}

/** Extracts up to 10 numeric digits from a phone raw value. */
export function cleanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.slice(0, 10);
}

/** Lower-cases and trims an email for Siigo contact dispatch. */
export function sanitizeEmail(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s/g, "");
}

/** Builds a Siigo customer name tuple, applying the text sanitizer. */
export function buildSiigoName(fullName: string): [string, string] {
  const [first, last] = splitName(fullName);
  return [sanitizeText(first), sanitizeText(last)];
}
