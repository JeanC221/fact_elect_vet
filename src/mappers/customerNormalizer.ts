import { sanitizeText, type Client, type Identification } from "@/schemas/provet";
import type { SiigoCustomer } from "@/schemas/siigo";

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

/** Lower-cases and trims an email for Siigo contact dispatch. */
export function sanitizeEmail(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s/g, "");
}

/** Builds a Siigo customer name tuple, applying the text sanitizer. */
export function buildSiigoName(fullName: string): [string, string] {
  const [first, last] = splitName(fullName);
  return [sanitizeText(first), sanitizeText(last)];
}

/**
 * Splits the DIAN verification digit out of a NIT. Only hyphenated NITs
 * carry an explicit check digit ("900123456-1"); plain-digit NITs pass
 * through unchanged since a trailing digit cannot be assumed to be the DV.
 */
export function splitNitCheckDigit(
  raw: string,
  type: Identification["type"],
): { identification: string; checkDigit?: string } {
  const cleaned = cleanIdChars(raw);
  if (type !== "NIT" || !raw.includes("-") || cleaned.length < 2) {
    return { identification: cleaned };
  }
  return { identification: cleaned.slice(0, -1), checkDigit: cleaned.slice(-1) };
}

/** Siigo customer name: Company → single business-name element; Person → [first, last]. */
export function buildCustomerName(
  fullName: string,
  personType: "Person" | "Company",
): [string] | [string, string] {
  if (personType === "Company") {
    const business = sanitizeText(fullName.trim());
    return [business.length > 0 ? business : "Cliente sin nombre"];
  }
  return buildSiigoName(fullName);
}

/**
 * Composes the official Siigo customer block from a Provet Client:
 * flat alphanumeric `identification`, numeric `branch_office` 0, optional
 * `check_digit` for hyphenated NITs, and `contacts` whenever an email is
 * available (Siigo requires a contact to honor `mail.send: true`).
 */
export function buildSiigoCustomer(client: Client): SiigoCustomer {
  const personType = mapPersonType(client.client_type);
  const { identification, checkDigit } = splitNitCheckDigit(
    client.identification.number,
    client.identification.type,
  );
  const customer: SiigoCustomer = {
    person_type: personType,
    id_type: mapIdentificationType(client.identification.type),
    identification,
    branch_office: 0,
    name: buildCustomerName(client.name || "Cliente sin nombre", personType),
  };
  if (checkDigit) customer.check_digit = checkDigit;
  const email = sanitizeEmail(client.email ?? "");
  if (email.length > 0) {
    const [first, last] = splitName(client.name || "Cliente sin nombre");
    customer.contacts = [
      {
        first_name: sanitizeText(first),
        last_name: sanitizeText(last),
        email,
        ...(client.phone ? { phone: { number: cleanPhone(client.phone) } } : {}),
      },
    ];
  }
  return customer;
}
