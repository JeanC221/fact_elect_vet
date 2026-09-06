import { describe, it, expect } from "vitest";
import {
  siigoInvoiceResponseSchema,
  siigoInvoiceItemSchema,
  siigoInvoicePayloadSchema,
  siigoProductSchema,
  siigoSellerSchema,
  siigoDocumentTypeCatalogEntrySchema,
} from "./siigo";

/**
 * Direct schema coverage for the Siigo contract.
 *
 * These schemas sit on the boundary where a wrong parse is expensive:
 *  - `siigoInvoiceResponseSchema` decides what the UI shows as the DIAN state
 *    of a legal document (Draft / Accepted / Rejected);
 *  - `siigoInvoiceItemSchema` decides whether an invoice line is billed with
 *    the VAT applied once or twice;
 *  - a parse failure on a SUCCESSFUL Siigo POST leaves the emission claim in
 *    `unknown`, which blocks the consultation even though the document exists.
 *
 * Everything asserted here was checked against the real schema behaviour, not
 * assumed.
 */

/** Minimal valid payload; individual tests override one field at a time. */
const basePayload = {
  document: { id: 1 },
  date: "2026-01-15",
  customer: {
    person_type: "Person" as const,
    id_type: "13",
    identification: "1020304050",
    branch_office: 0 as const,
    name: ["Ana", "Ruiz"],
  },
  seller: 7,
  items: [{ code: "SRV-01", description: "Consulta general", quantity: 1, taxed_price: 119000 }],
  payments: [{ id: 5, value: 119000 }],
  stamp: { send: true },
  mail: { send: false },
};

describe("siigoInvoiceResponseSchema — stamp flattening", () => {
  /**
   * UNVERIFIED SHAPE. No populated `stamp` with a CUFE has ever been observed
   * on this project: every sandbox document type is
   * `electronic_type: "NoElectronic"`, so `stamp.send: true` is refused with
   * `{"Code":"document_settings", ..., "Params":["stamp.send"]}`. The fixture
   * below follows Siigo's documentation, not a captured response. Re-check it
   * against a real stamped document once the clinic's production credentials
   * and documentTypeId 60345 are available.
   */
  it("flattens stamp.cufe and stamp.status to the root on an Accepted DIAN response", () => {
    const parsed = siigoInvoiceResponseSchema.parse({
      id: "b3f1c2d4-0000-4a11-9c3e-6a5b4c3d2e1f",
      number: 481,
      name: "FV-1-481",
      stamp: {
        status: "Accepted",
        cufe: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
        observations: "Documento validado por la DIAN",
      },
    });

    expect(parsed.status).toBe("Accepted");
    expect(parsed.cufe).toBe(
      "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    );
    expect(parsed.observations).toBe("Documento validado por la DIAN");
    // The nested original survives the transform: passthrough keeps the raw shape.
    expect(parsed.stamp?.cufe).toBe(parsed.cufe);
  });

  /**
   * The schema deliberately types `stamp.status` as a free string, NOT an enum:
   * an unrecognised DIAN state must not blow up the parse of a document that
   * already exists. The narrowing to Draft/Accepted/Rejected/Annulled happens
   * downstream in `mapSiigoInvoiceStatus` (mappers/invoiceHistory.ts).
   */
  it.each(["Draft", "Accepted", "Rejected", "Annulled", "EnProceso"])(
    "passes the status %s through verbatim instead of rejecting it",
    (status) => {
      const parsed = siigoInvoiceResponseSchema.parse({ id: "inv-1", stamp: { status } });
      expect(parsed.status).toBe(status);
    },
  );

  /**
   * THE OBSERVED CASE. Verified against the real Siigo sandbox: an unstamped
   * invoice comes back with no `stamp` key at all. Root keys observed were
   * balance, cost_center, customer, date, document, id, items, mail, metadata,
   * name, number, observations, payments, prefix, public_url, seller, total.
   */
  it("defaults to Draft with an empty cufe when stamp is absent entirely (OBSERVED sandbox response)", () => {
    const parsed = siigoInvoiceResponseSchema.parse({ id: "inv-2", number: 12 });
    expect(parsed.status).toBe("Draft");
    expect(parsed.cufe).toBe("");
    expect(parsed.observations).toBeUndefined();
  });

  it("defaults to Draft with an empty cufe when stamp is present but empty", () => {
    const parsed = siigoInvoiceResponseSchema.parse({ id: "inv-3", stamp: {} });
    expect(parsed.status).toBe("Draft");
    expect(parsed.cufe).toBe("");
  });

  /**
   * DEFENSIVE, NOT OBSERVED. The real sandbox response for an unstamped
   * invoice omits `stamp` entirely (covered by the test above); it does not
   * send `stamp: null`. `.nullish()` covers this case anyway because a
   * rejection on a successful POST is the worst outcome available here —
   * `POST /api/invoices` reads a post-emission validation failure as ambiguous
   * and pins the claim to `unknown`, wedging a consultation whose invoice
   * exists. Accepting a null we have never seen costs nothing.
   */
  it("treats a null stamp as unstamped instead of throwing", () => {
    const parsed = siigoInvoiceResponseSchema.parse({ id: "inv-4", stamp: null });
    expect(parsed.status).toBe("Draft");
    expect(parsed.cufe).toBe("");
    expect(parsed.observations).toBeUndefined();
  });

  it("treats null cufe / status / observations inside stamp as unstamped instead of throwing", () => {
    const parsed = siigoInvoiceResponseSchema.parse({
      id: "inv-5",
      stamp: { status: null, cufe: null, observations: null, errors: null },
    });
    expect(parsed.status).toBe("Draft");
    expect(parsed.cufe).toBe("");
    expect(parsed.observations).toBeUndefined();
  });

  it("never yields undefined where the UI expects a string", () => {
    for (const raw of [
      { id: "a" },
      { id: "a", stamp: null },
      { id: "a", stamp: {} },
      { id: "a", stamp: { status: null, cufe: null } },
      { id: "a", stamp: { status: "Rejected" } },
    ]) {
      const parsed = siigoInvoiceResponseSchema.parse(raw);
      expect(typeof parsed.cufe).toBe("string");
      expect(typeof parsed.status).toBe("string");
    }
  });

  it("still rejects a response without an id — an invoice with no identifier is unusable", () => {
    expect(siigoInvoiceResponseSchema.safeParse({ stamp: { status: "Accepted" } }).success).toBe(false);
  });
});

describe("siigoInvoiceItemSchema — the price / taxed_price XOR rule", () => {
  const line = { code: "SRV-01", description: "Consulta general", quantity: 1 };

  it("accepts a line carrying only taxed_price", () => {
    expect(siigoInvoiceItemSchema.safeParse({ ...line, taxed_price: 119000 }).success).toBe(true);
  });

  it("accepts a line carrying only price", () => {
    expect(siigoInvoiceItemSchema.safeParse({ ...line, price: 100000 }).success).toBe(true);
  });

  it("REJECTS a line carrying both price and taxed_price — a stale price would silently overcharge", () => {
    const result = siigoInvoiceItemSchema.safeParse({ ...line, price: 100000, taxed_price: 119000 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["taxed_price"]);
    }
  });

  it("REJECTS a line carrying neither price nor taxed_price — a free line on a legal document", () => {
    expect(siigoInvoiceItemSchema.safeParse(line).success).toBe(false);
  });

  it("REJECTS a taxed_price with more than 2 decimals (Siigo's limit)", () => {
    expect(siigoInvoiceItemSchema.safeParse({ ...line, taxed_price: 119000.123 }).success).toBe(false);
  });

  it("accepts a taxed_price with exactly 2 decimals", () => {
    expect(siigoInvoiceItemSchema.safeParse({ ...line, taxed_price: 119000.12 }).success).toBe(true);
  });

  it("REJECTS a price with more than 2 decimals as well", () => {
    expect(siigoInvoiceItemSchema.safeParse({ ...line, price: 100000.456 }).success).toBe(false);
  });

  it("carries the mapped product tax ids through untouched", () => {
    const parsed = siigoInvoiceItemSchema.parse({ ...line, taxed_price: 119000, taxes: [{ id: 1234 }] });
    expect(parsed.taxes).toEqual([{ id: 1234 }]);
  });
});

describe("siigoInvoicePayloadSchema — observations bound", () => {
  it("accepts observations at exactly the 500-character limit", () => {
    const result = siigoInvoicePayloadSchema.safeParse({ ...basePayload, observations: "x".repeat(500) });
    expect(result.success).toBe(true);
  });

  it("REJECTS observations above 500 characters — the field carries the reconciliation marker and must never be truncated by Siigo", () => {
    const result = siigoInvoicePayloadSchema.safeParse({ ...basePayload, observations: "x".repeat(501) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["observations"]);
    }
  });

  it("accepts a payload with no observations at all", () => {
    expect(siigoInvoicePayloadSchema.safeParse(basePayload).success).toBe(true);
  });

  it("propagates the item XOR rule up through the payload", () => {
    const bad = {
      ...basePayload,
      items: [{ code: "SRV-01", description: "Consulta", quantity: 1, price: 100000, taxed_price: 119000 }],
    };
    expect(siigoInvoicePayloadSchema.safeParse(bad).success).toBe(false);
  });
});

describe("siigoProductSchema — optional taxes array", () => {
  const product = { id: "p-1", code: "SRV-01", name: "Consulta general" };

  it("parses a product whose taxes array is populated (Taxed product, IVA 19%)", () => {
    const parsed = siigoProductSchema.parse({
      ...product,
      tax_classification: "Taxed",
      taxes: [{ id: 4321, name: "IVA", type: "IVA", percentage: 19 }],
    });
    expect(parsed.taxes).toHaveLength(1);
    expect(parsed.taxes?.[0].id).toBe(4321);
  });

  it("parses a product with NO taxes key at all (Excluded / Exempt products legitimately have none)", () => {
    const parsed = siigoProductSchema.parse({ ...product, tax_classification: "Excluded" });
    expect(parsed.taxes).toBeUndefined();
  });

  it("parses a product with an EMPTY taxes array without throwing", () => {
    const parsed = siigoProductSchema.parse({ ...product, taxes: [] });
    expect(parsed.taxes).toEqual([]);
  });

  it("keeps unmodelled Siigo fields via passthrough, so a catalogue sync never drops data", () => {
    const parsed = siigoProductSchema.parse({ ...product, account_group: { id: 1, name: "Servicios" } });
    expect((parsed as Record<string, unknown>).account_group).toEqual({ id: 1, name: "Servicios" });
  });

  it("sanitises the product name (Siigo rejects quotes in text fields)", () => {
    const parsed = siigoProductSchema.parse({ ...product, name: 'Consulta "urgente"' });
    expect(parsed.name).toBe("Consulta urgente");
  });

  /**
   * REGRESSION GUARD — schema output must be re-parseable by its own schema.
   *
   * `.min(1)` runs BEFORE `.transform(sanitizeText)`, so a name made entirely
   * of quotes or control characters passed the length check and came out as
   * "". That empty string then failed the same schema on a second parse, which
   * made any double-validation (route re-checking what the service already
   * validated) blow up on data the service had accepted. Worse, an empty name
   * silently reached the invoice payload. The length is now also enforced
   * AFTER sanitising, so the record is rejected at the source instead.
   */
  it("REJECTS a name that sanitises down to nothing, instead of emitting an empty string", () => {
    expect(siigoProductSchema.safeParse({ ...product, name: "''" }).success).toBe(false);
    expect(siigoProductSchema.safeParse({ ...product, name: "\u201C\u201D" }).success).toBe(false);
  });

  it("is idempotent: parsing its own output again succeeds and is unchanged", () => {
    const once = siigoProductSchema.parse({ ...product, name: 'Consulta "urgente"' });
    const twice = siigoProductSchema.parse(once);
    expect(twice).toEqual(once);
  });
});

describe("sanitised text fields are idempotent across every catalogue schema", () => {
  it("re-parses a parsed seller without failing on its own sanitised names", () => {
    const once = siigoSellerSchema.parse({ id: 1, first_name: 'Ana "A"', last_name: "Ruiz", active: true });
    expect(siigoSellerSchema.safeParse(once).success).toBe(true);
  });

  it("REJECTS a seller whose name sanitises to nothing", () => {
    expect(siigoSellerSchema.safeParse({ id: 1, first_name: "''", last_name: "Ruiz", active: true }).success).toBe(false);
  });

  it("re-parses a parsed document type without failing on its own sanitised name", () => {
    const once = siigoDocumentTypeCatalogEntrySchema.parse({
      id: 2372, code: "1", name: 'Factura "de venta"', type: "FV", active: true,
    });
    expect(siigoDocumentTypeCatalogEntrySchema.safeParse(once).success).toBe(true);
  });

  it("REJECTS an invoice line whose description sanitises to nothing — that line would reach the DIAN blank", () => {
    const result = siigoInvoiceItemSchema.safeParse({
      code: "SRV-01", description: "''", quantity: 1, taxed_price: 119000,
    });
    expect(result.success).toBe(false);
  });

  it("REJECTS a customer whose name element sanitises to nothing", () => {
    const bad = { ...basePayload, customer: { ...basePayload.customer, name: ["''", "Ruiz"] } };
    expect(siigoInvoicePayloadSchema.safeParse(bad).success).toBe(false);
  });
});
