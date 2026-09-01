import { describe, it, expect } from "vitest";
import {
  extractProvetItems, extractProvetPaymentMethods,
  buildItemMappingRows, buildPaymentMappingRows,
  defaultItemMapping, defaultPaymentMapping, reconcileMapping,
  serializeCatalogMapping, parseCatalogMapping, catalogMappingSchema,
  nameSimilarity, rankSiigoProductsFor,
} from "./catalogMapping";
import { mockConsultations } from "@/mocks/provet";
import { mockSiigoProducts, mockSiigoPaymentTypes } from "@/mocks/siigo";
import type { Consultation } from "@/schemas/provet";

describe("extractProvetItems", () => {
  it("returns distinct item codes in stable insertion order, keeping first name", () => {
    const items = extractProvetItems(mockConsultations);
    const codes = items.map((i) => i.code);
    expect(codes).toEqual(["SERV-CG-01", "LAB-HEM-01", "VAC-OCT-01", "MED-DES-05", "SERV-CUN-01"]);
    expect(items[0].name).toBe("Consulta General");
    expect(new Set(codes).size).toBe(codes.length);
  });
  it("dedupes repeated codes across consultations keeping first occurrence", () => {
    const dup: Consultation = { ...mockConsultations[0], id: "CON-DUP",
      items: [{ ...mockConsultations[0].items[0], name: "Otro Nombre" }] };
    const cg = extractProvetItems([mockConsultations[0], dup]).find((i) => i.code === "SERV-CG-01");
    expect(cg?.name).toBe("Consulta General");
  });
});

describe("extractProvetPaymentMethods", () => {
  it("returns distinct payment methods in stable order", () => {
    expect(extractProvetPaymentMethods(mockConsultations)).toEqual(["Tarjeta Crédito", "Efectivo", "Transferencia"]);
  });
});

describe("buildItemMappingRows", () => {
  it("flags mapped and unmapped items, resolving tax classification from the product", () => {
    const items = extractProvetItems(mockConsultations);
    const rows = buildItemMappingRows(items, mockSiigoProducts, defaultItemMapping(items, mockSiigoProducts));
    const cg = rows.find((r) => r.provetCode === "SERV-CG-01");
    expect(cg?.mapped).toBe(true);
    expect(cg?.siigoProductId).toBe("PROD-001");
    expect(cg?.siigoProductName).toBe("Consulta General Veterinaria");
    expect(cg?.siigoTaxClassification).toBe("IVA_19");
    const hem = rows.find((r) => r.provetCode === "LAB-HEM-01");
    expect(hem?.mapped).toBe(false);
    expect(hem?.siigoProductId).toBeNull();
    expect(hem?.siigoTaxClassification).toBeNull();
  });
  it("treats a stale siigoProductId (no longer in catalog) as unmapped", () => {
    const rows = buildItemMappingRows(extractProvetItems(mockConsultations), mockSiigoProducts,
      [{ provetCode: "LAB-HEM-01", siigoProductId: "PROD-GONE" }]);
    const hem = rows.find((r) => r.provetCode === "LAB-HEM-01");
    expect(hem?.mapped).toBe(false);
    expect(hem?.siigoProductId).toBeNull();
  });
});

describe("buildPaymentMappingRows", () => {
  it("resolves mapped payment type name and category", () => {
    const methods = extractProvetPaymentMethods(mockConsultations);
    const rows = buildPaymentMappingRows(methods, mockSiigoPaymentTypes, defaultPaymentMapping(methods, mockSiigoPaymentTypes));
    const ef = rows.find((r) => r.provetMethod === "Efectivo");
    expect(ef?.mapped).toBe(true);
    expect(ef?.siigoPaymentTypeId).toBe(10948);
    expect(ef?.siigoPaymentTypeName).toBe("Efectivo");
    expect(ef?.siigoPaymentCategory).toBe("cash");
  });
});

describe("defaultItemMapping", () => {
  it("auto-matches by equal code first", () => {
    const byCode = new Map(defaultItemMapping(extractProvetItems(mockConsultations), mockSiigoProducts)
      .map((m) => [m.provetCode, m.siigoProductId]));
    expect(byCode.get("SERV-CG-01")).toBe("PROD-001");
  });
  it("falls back to best name-similarity match when no code matches (e.g. 'Desparasitante Oral' -> 'Desparasitante Oral Canino')", () => {
    const byCode = new Map(defaultItemMapping(extractProvetItems(mockConsultations), mockSiigoProducts)
      .map((m) => [m.provetCode, m.siigoProductId]));
    expect(byCode.get("MED-DES-05")).toBe("PROD-003");
  });
  it("leaves items with zero shared words unmapped rather than guessing", () => {
    const byCode = new Map(defaultItemMapping(extractProvetItems(mockConsultations), mockSiigoProducts)
      .map((m) => [m.provetCode, m.siigoProductId]));
    expect(byCode.get("LAB-HEM-01")).toBeNull();
  });
  it("yields one entry per provet item", () => {
    const items = extractProvetItems(mockConsultations);
    expect(defaultItemMapping(items, mockSiigoProducts)).toHaveLength(items.length);
  });
});

describe("nameSimilarity / rankSiigoProductsFor", () => {
  it("scores 0 for names with no shared significant words", () => {
    expect(nameSimilarity("Hemograma Completo", "Cirugía de Esterilización")).toBe(0);
  });
  it("scores > 0 when names share significant words regardless of order/case/accents", () => {
    expect(nameSimilarity("desparasitante oral", "Desparasitante Oral Canino")).toBeGreaterThan(0);
  });
  it("ranks the best name match first", () => {
    const ranked = rankSiigoProductsFor("Desparasitante Oral", mockSiigoProducts);
    expect(ranked[0].name).toBe("Desparasitante Oral Canino");
  });
});

describe("defaultPaymentMapping", () => {
  it("matches by normalized name containment (accents/case-insensitive)", () => {
    const byMethod = new Map(defaultPaymentMapping(extractProvetPaymentMethods(mockConsultations), mockSiigoPaymentTypes)
      .map((m) => [m.provetMethod, m.siigoPaymentTypeId]));
    expect(byMethod.get("Efectivo")).toBe(10948);
    expect(byMethod.get("Tarjeta Crédito")).toBe(5636);
    expect(byMethod.get("Transferencia")).toBe(8466);
  });
  it("leaves unknown methods unmapped", () => {
    expect(defaultPaymentMapping(["Criptomonedas"], mockSiigoPaymentTypes)[0].siigoPaymentTypeId).toBeNull();
  });
});

describe("reconcileMapping", () => {
  it("drops removed provet entries, nulls stale siigo ids, adds new provet entries", () => {
    const items = extractProvetItems(mockConsultations);
    const methods = extractProvetPaymentMethods(mockConsultations);
    const stale = { items: [{ provetCode: "GONE-CODE", siigoProductId: "PROD-001" }],
      payments: [{ provetMethod: "GONE-METHOD", siigoPaymentTypeId: 99999 }], version: 1, updatedAt: "2026-01-01T00:00:00.000Z",
      documentTypeId: null, creditNoteDocumentTypeId: null, sellerId: null };
    const r = reconcileMapping(stale, items, mockSiigoProducts, methods, mockSiigoPaymentTypes);
    expect(r.items.map((m) => m.provetCode)).not.toContain("GONE-CODE");
    expect(r.items).toHaveLength(items.length);
    expect(r.payments).toHaveLength(methods.length);
    expect(r.payments.map((m) => m.provetMethod)).not.toContain("GONE-METHOD");
    expect(r.items.every((m) => m.siigoProductId === null)).toBe(true);
    expect(r.version).toBe(1);
    expect(r.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
  });

  it("keeps documentTypeId/creditNoteDocumentTypeId/sellerId when still present in the fresh catalog, nulls them when gone", () => {
    const items = extractProvetItems(mockConsultations);
    const methods = extractProvetPaymentMethods(mockConsultations);
    const fv = { id: 2372, code: "1", name: "Factura de venta", type: "FV", active: true };
    const nc = { id: 2379, code: "3", name: "Nota Crédito", type: "NC", active: true };
    const seller = { id: 916, first_name: "Pruebas", last_name: "Api", active: true };
    const withSettings = { items: [], payments: [], version: 1, updatedAt: "2026-01-01T00:00:00.000Z",
      documentTypeId: 2372, creditNoteDocumentTypeId: 2379, sellerId: 916 };
    const kept = reconcileMapping(withSettings, items, mockSiigoProducts, methods, mockSiigoPaymentTypes, [fv, nc], [seller]);
    expect(kept.documentTypeId).toBe(2372);
    expect(kept.creditNoteDocumentTypeId).toBe(2379);
    expect(kept.sellerId).toBe(916);
    const nulled = reconcileMapping(withSettings, items, mockSiigoProducts, methods, mockSiigoPaymentTypes, [], []);
    expect(nulled.documentTypeId).toBeNull();
    expect(nulled.creditNoteDocumentTypeId).toBeNull();
    expect(nulled.sellerId).toBeNull();
  });
});

describe("serialize / parse", () => {
  it("round-trips a catalog mapping through JSON", () => {
    const items = extractProvetItems(mockConsultations);
    const methods = extractProvetPaymentMethods(mockConsultations);
    const mapping = { items: defaultItemMapping(items, mockSiigoProducts),
      payments: defaultPaymentMapping(methods, mockSiigoPaymentTypes),
      version: 1, updatedAt: new Date("2026-08-26T00:00:00.000Z").toISOString(),
      documentTypeId: null, creditNoteDocumentTypeId: null, sellerId: null };
    expect(parseCatalogMapping(serializeCatalogMapping(mapping))).toEqual(mapping);
  });
  it("parseCatalogMapping throws on corrupt JSON", () => {
    expect(() => parseCatalogMapping("{not json")).toThrow();
  });
  it("parseCatalogMapping throws on schema-invalid payload", () => {
    expect(() => parseCatalogMapping(JSON.stringify({ items: [], payments: [] }))).toThrow();
  });
});

describe("catalogMappingSchema", () => {
  it("accepts a well-formed mapping with null siigo ids", () => {
    const ok = { items: [{ provetCode: "X", siigoProductId: null }],
      payments: [{ provetMethod: "Y", siigoPaymentTypeId: null }], version: 0, updatedAt: "2026-08-26T00:00:00.000Z" };
    expect(catalogMappingSchema.safeParse(ok).success).toBe(true);
  });
});