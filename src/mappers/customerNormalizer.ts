import { sanitizeText, type Identification } from "@/schemas/provet";

/** Remove dots, dashes and spaces from any identification raw value. */
function cleanIdChars(raw: string): string {
  return raw.replace(/[.\s]/g, "").replace(/-/g, "");
}

/** Siigo identification-type codes (DIAN Resolution 948 → Siigo Nube). */
const IDENTIFICATION_TYPE_MAP: Record<Identification["type"], string> = {
  CC: "13",
  CE: "22",
  NIT: "31",
  PA: "41",
};

/**
 * Normalizes a raw identification number for Siigo as a flat string:
 * strips dots, dashes and spaces. The cleaned string lands in the
 * `customer.identification` field; the document type is mapped separately
 * via `mapIdentificationType` into `customer.identification_type`.
 */
export function cleanIdentification(raw: string): string {
  return cleanIdChars(raw);
}

/** Maps a Provet identification type to its Siigo numeric code for `identification_type`. */
export function mapIdentificationType(type: Identification["type"]): string {
  return IDENTIFICATION_TYPE_MAP[type];
}

/** Maps a Provet client type to Siigo's person_type enumeration. */
export function mapPersonType(
  clientType: "natural" | "juridical",
): "Person" | "Company" {
  return clientType === "juridical" ? "Company" : "Person";
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
