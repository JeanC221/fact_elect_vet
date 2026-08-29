import { describe, expect, it } from "vitest";
import {
  buildSiigoName,
  cleanIdentification,
  cleanPhone,
  mapIdentificationType,
  mapPersonType,
  sanitizeEmail,
  splitName,
} from "./customerNormalizer";

describe("cleanIdentification", () => {
  it("strips dots, dashes and spaces from cédulas into a flat string", () => {
    expect(cleanIdentification("12.345.678-90")).toBe("1234567890");
  });

  it("strips dots, dashes and spaces from NITs into a flat string", () => {
    expect(cleanIdentification("900.123.456 - 1")).toBe("9001234561");
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
  it("maps natural → Person and juridical → Company", () => {
    expect(mapPersonType("natural")).toBe("Person");
    expect(mapPersonType("juridical")).toBe("Company");
  });
});

describe("splitName", () => {
  it("splits a two-part name into firstname and lastname", () => {
    expect(splitName("María García López")).toEqual(["María García", "López"]);
  });

  it("duplicates the single part when only one word is provided", () => {
    expect(splitName("Clínica")).toEqual(["Clínica", "Clínica"]);
  });

  it("falls back for empty input", () => {
    expect(splitName("  ")).toEqual(["Cliente", "sin nombre"]);
  });
});

describe("buildSiigoName", () => {
  it("sanitizes quote and control chars", () => {
    expect(buildSiigoName("Clínica Vet")).toEqual(["Clínica", "Vet"]);
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
});
