import { describe, expect, it } from "vitest";
import {
  buildSiigoContacts,
  buildSiigoName,
  cleanIdentification,
  cleanPhone,
  mapIdentificationType,
  mapPersonType,
  sanitizeEmail,
  splitName,
} from "./customerNormalizer";

describe("cleanIdentification", () => {
  it("strips dots, dashes and spaces from cedulas into a flat string", () => {
    expect(cleanIdentification("12.345.678-90")).toBe("1234567890");
  });

  it("strips dots, dashes and spaces from NITs into a flat string", () => {
    expect(cleanIdentification("900.123.456 - 1")).toBe("9001234561");
  });

  it("strips ALL non-alphanumeric chars (slashes, parens, etc.)", () => {
    expect(cleanIdentification("CE-98/76.54 (3)")).toBe("CE9876543");
  });
});

describe("mapIdentificationType", () => {
  it("maps Provet identification types to Siigo numeric codes", () => {
    expect(mapIdentificationType("CC")).toBe("13");
    expect(mapIdentificationType("CE")).toBe("22");
    expect(mapIdentificationType("NIT")).toBe("31");
    expect(mapIdentificationType("PA")).toBe("41");
  });
});

describe("mapPersonType", () => {
  it("maps natural -> Person and juridical -> Company", () => {
    expect(mapPersonType("natural")).toBe("Person");
    expect(mapPersonType("juridical")).toBe("Company");
  });
});

describe("splitName", () => {
  it("splits a two-part name into firstname and lastname", () => {
    expect(splitName("Maria Garcia Lopez")).toEqual(["Maria Garcia", "Lopez"]);
  });

  it("duplicates the single part when only one word is provided", () => {
    expect(splitName("Clinica")).toEqual(["Clinica", "Clinica"]);
  });

  it("falls back for empty input", () => {
    expect(splitName("  ")).toEqual(["Cliente", "sin nombre"]);
  });
});

describe("buildSiigoName", () => {
  it("sanitizes quote and control chars", () => {
    expect(buildSiigoName("Clinica Vet")).toEqual(["Clinica", "Vet"]);
  });

  it("strips smart quotes from each name part", () => {
    expect(buildSiigoName("Maria \u201CGarcia\u201D Lopez")).toEqual(["Maria Garcia", "Lopez"]);
  });
});

describe("buildSiigoContacts", () => {
  it("builds a single contact from a full name and email", () => {
    expect(buildSiigoContacts("María García López", "maria.garcia@email.com")).toEqual([
      { first_name: "María García", last_name: "López", email: "maria.garcia@email.com" },
    ]);
  });

  it("sanitizes the email (trims, lowercases, strips smart quotes)", () => {
    const contacts = buildSiigoContacts("Clinica Vet", "  \u201Cinfo\u201D@Clinica.CO ");
    expect(contacts?.[0].email).toBe("info@clinica.co");
  });

  it("returns undefined when the email is empty", () => {
    expect(buildSiigoContacts("Cliente Sin Email", "")).toBeUndefined();
    expect(buildSiigoContacts("Cliente Sin Email", "   ")).toBeUndefined();
  });
});

describe("cleanPhone", () => {
  it("extracts digits and caps at 10", () => {
    expect(cleanPhone("(310) 555-0101")).toBe("3105550101");
    expect(cleanPhone("123456789012345")).toBe("1234567890");
  });
});

describe("sanitizeEmail", () => {
  it("trims, lowercases and removes spaces", () => {
    expect(sanitizeEmail("  Maria@Email.COM ")).toBe("maria@email.com");
  });

  it("strips smart quotes from the email string", () => {
    expect(sanitizeEmail("\u201Cmaria\u201D@email.com")).toBe("maria@email.com");
  });
});