import { describe, it, expect } from "vitest";
import {
  resolveConsultationInvoiceTotal,
  NoInvoiceForConsultationError,
  AmbiguousConsultationInvoiceError,
} from "./consultationInvoiceTotal";
import type { ProvetInvoiceRaw } from "@/schemas/provetApi";

/** Minimal valid ProvetInvoiceRaw builder — only the fields this module reads. */
function invoice(overrides: Partial<ProvetInvoiceRaw>): ProvetInvoiceRaw {
  return {
    id: "1",
    url: null,
    status: "3",
    total: 0,
    total_vat: 0,
    total_with_vat: 0,
    consultation: null,
    credit_note: false,
    original_consultation: null,
    client: null,
    invoice_number: null,
    ...overrides,
  };
}

describe("resolveConsultationInvoiceTotal — C-12", () => {
  it("returns total_with_vat for the single non-credit-note invoice matching the consultation", () => {
    const invoices = [
      invoice({ id: "5", consultation: "https://api.provet.test/consultation/4/", total_with_vat: 1699.04, credit_note: false }),
    ];
    expect(resolveConsultationInvoiceTotal("4", invoices)).toBe(1699.04);
  });

  it("matches a bare (non-URL) consultation id the same way", () => {
    const invoices = [invoice({ id: "5", consultation: "4", total_with_vat: 1699.04 })];
    expect(resolveConsultationInvoiceTotal("4", invoices)).toBe(1699.04);
  });

  it("excludes credit notes even if one somehow carries a matching consultation id", () => {
    const invoices = [
      invoice({ id: "6", consultation: "4", total_with_vat: 125.0, credit_note: true }),
      invoice({ id: "5", consultation: "4", total_with_vat: 1699.04, credit_note: false }),
    ];
    expect(resolveConsultationInvoiceTotal("4", invoices)).toBe(1699.04);
  });

  it("ignores invoices belonging to a different consultation", () => {
    const invoices = [
      invoice({ id: "9", consultation: "99", total_with_vat: 500 }),
      invoice({ id: "5", consultation: "4", total_with_vat: 1699.04 }),
    ];
    expect(resolveConsultationInvoiceTotal("4", invoices)).toBe(1699.04);
  });

  it("throws NoInvoiceForConsultationError when nothing matches — fail loud, never trust the client's number by default", () => {
    const invoices = [invoice({ id: "9", consultation: "99", total_with_vat: 500 })];
    expect(() => resolveConsultationInvoiceTotal("4", invoices)).toThrow(NoInvoiceForConsultationError);
  });

  it("throws NoInvoiceForConsultationError when Provet reports nothing at all", () => {
    expect(() => resolveConsultationInvoiceTotal("4", [])).toThrow(NoInvoiceForConsultationError);
  });

  it("throws AmbiguousConsultationInvoiceError on more than one non-credit-note match — refuses to guess which is authoritative", () => {
    const invoices = [
      invoice({ id: "5", consultation: "4", total_with_vat: 1699.04 }),
      invoice({ id: "7", consultation: "4", total_with_vat: 200 }),
    ];
    let error: unknown;
    try {
      resolveConsultationInvoiceTotal("4", invoices);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AmbiguousConsultationInvoiceError);
    expect((error as AmbiguousConsultationInvoiceError).count).toBe(2);
  });
});
