import { sanitizeText, type Identification } from "@/schemas/provet";

/** Smart quotes (curly + ASCII double) stripped from names and contact emails. */
const SMART_QUOTES = /[\u201C\u201D"]/g;

/** Strip ALL non-alphanumeric chars from an identification raw value. */
function cleanIdChars(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "");
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
 * strips ALL non-alphanumeric chars. The cleaned string lands in the
 * `customer.identification` field; the document type is mapped separately
 * via `mapIdentificationType` into `customer.id_type`.
 */
export function cleanIdentification(raw: string): string {
  return cleanIdChars(raw);
}

/** Maps a Provet identification type to its Siigo numeric code for `id_type`. */
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

/** Lower-cases, trims and strips smart quotes from an email for Siigo contact dispatch. */
export function sanitizeEmail(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s/g, "").replace(SMART_QUOTES, "");
}

/** Builds a Siigo customer name tuple, stripping smart quotes + applying the text sanitizer. */
export function buildSiigoName(fullName: string): [string, string] {
  const [first, last] = splitName(fullName);
  return [
    sanitizeText(first.replace(SMART_QUOTES, "")),
    sanitizeText(last.replace(SMART_QUOTES, "")),
  ];
}

/**
 * Builds the Siigo `customer.contacts` array (≥1 entry) for invoice email
 * dispatch. Splits the full name into first/last, sanitizes the email, and
 * returns `undefined` when the email is empty (contacts stay optional).
 */
export function buildSiigoContacts(
  fullName: string,
  email: string,
): [{ first_name: string; last_name: string; email: string }] | undefined {
  const cleanEmail = sanitizeEmail(email);
  if (cleanEmail.length === 0) return undefined;
  const [first_name, last_name] = buildSiigoName(fullName);
  return [{ first_name, last_name, email: cleanEmail }];
}