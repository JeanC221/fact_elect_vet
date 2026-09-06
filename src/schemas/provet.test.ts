import { describe, it, expect } from "vitest";
import {
  consultationSchema,
  identificationSchema,
  toCents,
  hasMaxDecimals,
  sanitizeText,
} from "./provet";

/**
 * Direct coverage for the Provet-side schema, and in particular for the totals
 * reconciliation `.refine()`:
 *
 *   toCents(subtotal + tax_total) === toCents(total)
 *
 * That refine is the last line of defence against invoicing an amount Provet
 * never actually computed. It has to reject genuine mismatches while absorbing
 * IEEE-754 drift, which naive `subtotal + tax_total === total` does not: in
 * plain floating point 0.1 + 0.2 !== 0.3, so a correct consultation would be
 * rejected. Every drift case below was measured, not assumed.
 */

const baseItem = {
  name: "Consulta general",
  code: "SRV-01",
  quantity: 1,
  unit_price: 100000,
  tax_rate: 0.19,
  discount: 0,
};

function consultationWith(totals: { subtotal: number; tax_total: number; total: number }) {
  return {
    id: "CON-001",
    client_id: "CLI-001",
    patient_id: "PAT-001",
    items: [baseItem],
    ...totals,
    payment_method: "Efectivo",
    status: "closed" as const,
    created_at: "2026-01-15T10:00:00.000Z",
    updated_at: "2026-01-15T10:30:00.000Z",
  };
}

describe("consultationSchema — totals reconciliation refine", () => {
  it("accepts a consultation whose subtotal + tax_total equals the total exactly", () => {
    const result = consultationSchema.safeParse(
      consultationWith({ subtotal: 100000, tax_total: 19000, total: 119000 }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a zero-value consultation (subtotal 0 + tax 0 = 0)", () => {
    const result = consultationSchema.safeParse(
      consultationWith({ subtotal: 0, tax_total: 0, total: 0 }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a tax-exempt consultation (tax_total 0, total equals subtotal)", () => {
    const result = consultationSchema.safeParse(
      consultationWith({ subtotal: 85000, tax_total: 0, total: 85000 }),
    );
    expect(result.success).toBe(true);
  });

  it("REJECTS a total that does not equal subtotal + tax_total, pointing at `total`", () => {
    const result = consultationSchema.safeParse(
      consultationWith({ subtotal: 100000, tax_total: 19000, total: 120000 }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "total");
      expect(issue).toBeDefined();
      expect(issue?.message).toMatch(/subtotal \+ tax_total/);
    }
  });

  it("REJECTS a one-cent discrepancy — the refine compares cents, not rounded pesos", () => {
    const result = consultationSchema.safeParse(
      consultationWith({ subtotal: 100000, tax_total: 19000, total: 119000.01 }),
    );
    expect(result.success).toBe(false);
  });

  it("REJECTS a total silently missing the tax (the classic double-VAT / no-VAT bug)", () => {
    const result = consultationSchema.safeParse(
      consultationWith({ subtotal: 100000, tax_total: 19000, total: 100000 }),
    );
    expect(result.success).toBe(false);
  });

  /**
   * Measured: 0.1 + 0.2 === 0.30000000000000004 in IEEE-754, so a raw equality
   * check would reject this legitimate consultation. toCents rounds both sides
   * to 30 and the refine passes.
   */
  it("ACCEPTS a consultation with float drift that raw === would wrongly reject", () => {
    expect(0.1 + 0.2 === 0.3).toBe(false); // the drift is real, not hypothetical
    const result = consultationSchema.safeParse(
      consultationWith({ subtotal: 0.1, tax_total: 0.2, total: 0.3 }),
    );
    expect(result.success).toBe(true);
  });

  /**
   * Second measured drift case, this one with 2-decimal inputs so it also
   * clears the `hasMaxDecimals(n, 2)` guard: 4.35 + 0.35 === 4.699999999999999.
   */
  it("ACCEPTS a second measured drift case (4.35 + 0.35 === 4.699999999999999)", () => {
    expect(4.35 + 0.35 === 4.7).toBe(false);
    const result = consultationSchema.safeParse(
      consultationWith({ subtotal: 4.35, tax_total: 0.35, total: 4.7 }),
    );
    expect(result.success).toBe(true);
  });

  it("still rejects a consultation with no items at all", () => {
    const result = consultationSchema.safeParse({
      ...consultationWith({ subtotal: 0, tax_total: 0, total: 0 }),
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects amounts with more than 2 decimals before the refine ever runs", () => {
    const result = consultationSchema.safeParse(
      consultationWith({ subtotal: 100000.123, tax_total: 0, total: 100000.123 }),
    );
    expect(result.success).toBe(false);
  });
});

describe("toCents — the drift absorber the refine depends on", () => {
  it("collapses IEEE-754 drift to the same cent integer", () => {
    expect(toCents(0.1 + 0.2)).toBe(toCents(0.3));
    expect(toCents(1.005 + 0.005)).toBe(toCents(1.01));
  });

  it("keeps a genuine one-cent difference distinguishable", () => {
    expect(toCents(119000.01)).not.toBe(toCents(119000));
  });

  it("returns an integer number of cents for whole-peso COP amounts", () => {
    expect(toCents(119000)).toBe(11900000);
    expect(Number.isInteger(toCents(84033.61))).toBe(true);
  });
});

describe("hasMaxDecimals", () => {
  it("accepts values at or under the limit", () => {
    expect(hasMaxDecimals(119000, 2)).toBe(true);
    expect(hasMaxDecimals(119000.1, 2)).toBe(true);
    expect(hasMaxDecimals(119000.12, 2)).toBe(true);
  });

  it("rejects values above the limit", () => {
    expect(hasMaxDecimals(119000.123, 2)).toBe(false);
  });

  it("rejects non-finite values instead of letting them through", () => {
    expect(hasMaxDecimals(Number.NaN, 2)).toBe(false);
    expect(hasMaxDecimals(Number.POSITIVE_INFINITY, 2)).toBe(false);
  });
});

describe("sanitizeText", () => {
  it("strips straight and typographic quotes (Siigo rejects them in text fields)", () => {
    expect(sanitizeText('Vacuna "anual"')).toBe("Vacuna anual");
    expect(sanitizeText("Vacuna \u201Canual\u201D")).toBe("Vacuna anual");
    expect(sanitizeText("O'Brien")).toBe("O Brien");
  });

  it("strips ASCII control characters and collapses the resulting whitespace", () => {
    expect(sanitizeText("Consulta\u0000\u0001 general")).toBe("Consulta general");
  });
});

describe("identificationSchema — per-type format rules", () => {
  it.each([
    ["CC", "1020304050"],
    ["NIT", "900123456"],
    ["NIT", "900123-4"],
    ["CE", "AB12345"],
    ["PA", "PA987654"],
  ])("accepts a valid %s", (type, number) => {
    expect(identificationSchema.safeParse({ type, number }).success).toBe(true);
  });

  it.each([
    ["CC", "12345"],
    ["CC", "10203040506"],
    ["NIT", "12345"],
    ["CE", "AB1"],
  ])("rejects an invalid %s (%s)", (type, number) => {
    const result = identificationSchema.safeParse({ type, number });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["number"]);
    }
  });
});
