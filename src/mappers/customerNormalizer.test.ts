import { describe, expect, it } from "vitest";
import {
  buildCustomerName,
  buildSiigoCustomer,
  buildSiigoName,
  cleanIdentification,
  cleanPhone,
  mapIdentificationType,
  mapPersonType,
  sanitizeEmail,
  splitName,
  splitNitCheckDigit,
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

describe("splitNitCheckDigit", () => {
  it("splits the verification digit only for hyphenated NITs", () => {
    expect(splitNitCheckDigit("900.123.456 - 1", "NIT")).toEqual({ identification: "900123456", checkDigit: "1" });
    expect(splitNitCheckDigit("9001234561", "NIT")).toEqual({ identification: "9001234561" });
  });

  it("never splits non-NIT documents", () => {
    expect(splitNitCheckDigit("12.345.678-90", "CC")).toEqual({ identification: "1234567890" });
    expect(splitNitCheckDigit("CE9876543", "CE")).toEqual({ identification: "CE9876543" });
  });
});

describe("buildCustomerName", () => {
  it("emits a single sanitized element for Company", () => {
    expect(buildCustomerName("Veterinaria Los Andes S.A.S.", "Company")).toEqual(["Veterinaria Los Andes S.A.S."]);
  });

  it("emits the first/last tuple for Person", () => {
    expect(buildCustomerName("María García López", "Person")).toEqual(["María García", "López"]);
  });

  it("falls back when the business name is empty", () => {
    expect(buildCustomerName("  ", "Company")).toEqual(["Cliente sin nombre"]);
  });

  it("strips typographic smart quotes and unescaped quotes from Person names", () => {
    expect(buildCustomerName("“Charles Montgomery” Burns", "Person")).toEqual(["Charles Montgomery", "Burns"]);
    expect(buildCustomerName("O’Connor", "Person")).toEqual(["O Connor", "O Connor"]);
  });

  it("strips typographic smart quotes from Company business names", () => {
    expect(buildCustomerName("“Vet” Los Andes", "Company")).toEqual(["Vet Los Andes"]);
  });
});

describe("buildSiigoCustomer", () => {
  it("composes flat identification, branch_office 0 and contacts from a Client", () => {
    const customer = buildSiigoCustomer({
      id: "CLI-002",
      identification: { type: "NIT", number: "900123456-1" },
      name: "Veterinaria Los Andes S.A.S.",
      email: "FACTURA@LosAndes.co ",
      address: "Cra 15 #92-38",
      phone: "(604) 555-0102",
      client_type: "juridical",
    });
    expect(customer).toMatchObject({
      person_type: "Company",
      id_type: "31",
      identification: "900123456",
      check_digit: "1",
      branch_office: 0,
      name: ["Veterinaria Los Andes S.A.S."],
    });
    expect(customer).not.toHaveProperty("identification_type");
    expect(customer.contacts?.[0]).toMatchObject({ email: "factura@losandes.co", phone: "6045550102" });
    expect(customer.contacts?.[0]?.first_name).toBe("Veterinaria Los Andes");
    expect(customer.contacts?.[0]?.last_name).toBe("S.A.S.");
  });

  it("omits contacts when the client email is empty", () => {
    const customer = buildSiigoCustomer({
      id: "CLI-001",
      identification: { type: "CC", number: "1234567890" },
      name: "María García López",
      email: "",
      address: "Calle 80",
      phone: "3105550101",
      client_type: "natural",
    });
    expect(customer.contacts).toBeUndefined();
    expect(customer.name).toEqual(["María García", "López"]);
    expect(customer).not.toHaveProperty("check_digit");
  });
});
