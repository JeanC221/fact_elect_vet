import { describe, expect, it } from "vitest";
import {
  buildSiigoName,
  cleanIdentification,
  cleanPhone,
  sanitizeEmail,
  splitName,
} from "./customerNormalizer";

describe("cleanIdentification", () => {
  it("strips dots, dashes and spaces from cédulas", () => {
    expect(cleanIdentification("CC", "12.345.678-90")).toEqual({
      type: "CC",
      number: "1234567890",
    });
  });

  it("strips dots, dashes and spaces from NITs", () => {
    expect(cleanIdentification("NIT", "900.123.456 - 1")).toEqual({
      type: "NIT",
      number: "9001234561",
    });
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
