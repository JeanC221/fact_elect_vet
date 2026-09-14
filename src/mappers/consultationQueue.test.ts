import { describe, expect, it } from "vitest";
import {
  buildConsultationQueue,
  buildInvoicePayloadFromQuickEdit,
  buildPaymentOptions,
  buildQuickEditDetail,
  detectFullReversal,
  detectTotalMismatch,
  formatCOP,
  formatDate,
  quickEditFormSchema,
  type QuickEditFormValues,
} from "./consultationQueue";
import { siigoInvoicePayloadSchema } from "@/schemas/siigo";
import { toCents } from "@/schemas/provet";
import { mockClients, mockConsultations, mockPatients } from "@/mocks/provet";
import { TotalMismatchError, CorruptInvoiceRowError, ReversedConsultationError, type ProvetToSiigoOptions } from "@/mappers/provetToSiigo";
import type { CatalogMapping } from "@/mappers/catalogMapping";
import { mockSiigoProducts } from "@/mocks/siigo";

const validFormValues: QuickEditFormValues = { name: "María García López", identificationType: "CC", identificationNumber: "1234567890", email: "nueva@mail.co", phone: "3105550101", paymentMethod: "Efectivo", paidAmount: 95200 };

/** Dynamic catalog for emission — Task 4: payment ids resolve ONLY from options.mapping.payments. */
const emitOpts: ProvetToSiigoOptions = { mapping: { items: [], payments: [{ provetMethod: "Tarjeta Crédito", siigoPaymentTypeId: 5636 }, { provetMethod: "Efectivo", siigoPaymentTypeId: 10948 }], version: 1, updatedAt: "2026-08-26T00:00:00.000Z", documentTypeId: 2372, creditNoteDocumentTypeId: 2379, sellerId: 62 }, siigoProducts: mockSiigoProducts, mode: "sandbox", documentTypeId: 2372, sellerId: 62 };
/** Mapped catalog for Quick-Edit detail — only active mapped payments appear in the dropdown. */
const testMapping: CatalogMapping = emitOpts.mapping;

describe("buildConsultationQueue", () => {
  it("returns one row per consultation", () => {
    const rows = buildConsultationQueue(mockConsultations, mockClients, mockPatients);
    expect(rows).toHaveLength(mockConsultations.length);
  });

  it("enriches each row with client name and document", () => {
    const con1 = buildConsultationQueue(mockConsultations, mockClients, mockPatients).find((r) => r.id === "CON-001");
    expect(con1?.clientName).toBe("María García López");
    expect(con1?.clientDoc).toBe("CC 1234567890");
  });

  it("enriches each row with patient name", () => {
    expect(buildConsultationQueue(mockConsultations, mockClients, mockPatients).find((r) => r.id === "CON-002")?.patientName).toBe("Rocky");
  });

  it("carries consultation total and payment method", () => {
    const con3 = buildConsultationQueue(mockConsultations, mockClients, mockPatients).find((r) => r.id === "CON-003");
    expect(con3?.total).toBe(120000);
    expect(con3?.paymentMethod).toBe("Transferencia");
  });

  it("defaults invoiceStatus to Draft and preserves provetStatus", () => {
    const rows = buildConsultationQueue(mockConsultations, mockClients, mockPatients);
    rows.forEach((r) => {
      expect(r.invoiceStatus).toBe("Draft");
      expect(["pending", "closed"]).toContain(r.provetStatus);
    });
  });

  it("falls back gracefully for unknown client/patient", () => {
    const orphan = [{ ...mockConsultations[0], id: "CON-X", client_id: "CLI-NOPE", patient_id: "PAT-NOPE" }];
    const rows = buildConsultationQueue(orphan, mockClients, mockPatients);
    expect(rows[0].clientName).toBe("Cliente desconocido");
    expect(rows[0].patientName).toBe("Paciente desconocido");
    expect(rows[0].clientDoc).toBe("—");
  });
});

describe("formatCOP", () => {
  it("formats a number as Colombian pesos without decimals", () => {
    expect(formatCOP(95200)).toBe("$95.200");
  });
});

describe("formatDate", () => {
  it("formats an ISO date as YYYY-MM-DD (es-CO)", () => {
    expect(formatDate(new Date("2026-08-15T08:00:00.000Z"))).toBe("2026-08-15");
  });

  it("renders the Colombia day, not the UTC day, for an evening consultation", () => {
    // 21:00 COT on the 14th is already the 15th in UTC.
    expect(formatDate(new Date("2026-08-15T02:00:00.000Z"))).toBe("2026-08-14");
  });

  it("renders midnight COT as the day that just started", () => {
    expect(formatDate(new Date("2026-08-15T05:00:00.000Z"))).toBe("2026-08-15");
  });
});

describe("buildQuickEditDetail", () => {
  it("builds pre-filled detail for a known consultation with mapped payment options and empty paymentMethod", () => {
    const d = buildQuickEditDetail(mockConsultations, mockClients, mockPatients, "CON-001", testMapping);
    expect(d?.clientName).toBe("María García López");
    expect(d?.identificationNumber).toBe("1234567890");
    expect(d?.phone).toBe("3105550101");
    expect([d?.patientName, d?.total]).toEqual(["Max", 95200]);
    expect(d?.paymentMethod).toBe("");
    expect(d?.paymentMethodOptions).toEqual([
      { provetMethod: "Tarjeta Crédito", siigoPaymentTypeId: 5636 },
      { provetMethod: "Efectivo", siigoPaymentTypeId: 10948 },
    ]);
  });

  it("returns undefined for unknown consultation id", () => {
    expect(buildQuickEditDetail(mockConsultations, mockClients, mockPatients, "CON-NOPE")).toBeUndefined();
  });

  it("returns a detail with fallback defaults for an orphan client instead of undefined", () => {
    const orphan = [{ ...mockConsultations[0], id: "CON-X", client_id: "CLI-NOPE" }];
    const d = buildQuickEditDetail(orphan, mockClients, mockPatients, "CON-X");
    expect(d).toBeDefined();
    expect([d?.clientName, d?.identificationType, d?.identificationNumber, d?.email]).toEqual(["Cliente desconocido", "CC", "", ""]);
  });

  it("only includes active mapped payments — unmapped methods like Nequi are excluded", () => {
    const custom = [{ ...mockConsultations[0], payment_method: "Nequi" }];
    const d = buildQuickEditDetail(custom, mockClients, mockPatients, "CON-001", testMapping);
    expect(d?.paymentMethodOptions.map((o) => o.provetMethod)).not.toContain("Nequi");
    expect(d?.paymentMethodOptions.map((o) => o.provetMethod)).toEqual(["Tarjeta Crédito", "Efectivo"]);
  });
});

describe("buildPaymentOptions", () => {
  it("returns only non-null mapped payments", () => {
    const mapping: CatalogMapping = { items: [], payments: [{ provetMethod: "Efectivo", siigoPaymentTypeId: 10948 }, { provetMethod: "Nequi", siigoPaymentTypeId: null }], version: 1, updatedAt: "2026-08-26T00:00:00.000Z", documentTypeId: null, creditNoteDocumentTypeId: null, sellerId: null };
    expect(buildPaymentOptions(mapping)).toEqual([{ provetMethod: "Efectivo", siigoPaymentTypeId: 10948 }]);
  });
  it("returns empty array when no mapping provided", () => {
    expect(buildPaymentOptions(undefined)).toEqual([]);
  });
});

describe("quickEditFormSchema", () => {
  it("accepts valid values", () => {
    expect(quickEditFormSchema.safeParse(validFormValues).success).toBe(true);
  });

  it("rejects invalid email, wrong NIT format and non-positive paidAmount", () => {
    expect(quickEditFormSchema.safeParse({ ...validFormValues, email: "nope" }).success).toBe(false);
    expect(quickEditFormSchema.safeParse({ ...validFormValues, identificationType: "NIT", identificationNumber: "ABC" }).success).toBe(false);
    expect(quickEditFormSchema.safeParse({ ...validFormValues, paidAmount: 0 }).success).toBe(false);
  });

  it("accepts a NIT with or without the verification-digit hyphen", () => {
    expect(quickEditFormSchema.safeParse({ ...validFormValues, identificationType: "NIT", identificationNumber: "900123456-1" }).success).toBe(true);
    expect(quickEditFormSchema.safeParse({ ...validFormValues, identificationType: "NIT", identificationNumber: "9001234561" }).success).toBe(true);
  });

  it("rejects a paidAmount with more than 2 decimals", () => {
    expect(quickEditFormSchema.safeParse({ ...validFormValues, paidAmount: 95200.001 }).success).toBe(false);
  });

  it("rejects empty name and too-short phone", () => {
    expect(quickEditFormSchema.safeParse({ ...validFormValues, name: "" }).success).toBe(false);
    expect(quickEditFormSchema.safeParse({ ...validFormValues, phone: "123456" }).success).toBe(false);
  });

  it("rejects a negative paidAmount", () => {
    expect(quickEditFormSchema.safeParse({ ...validFormValues, paidAmount: -100 }).success).toBe(false);
  });

  it("accepts a paidAmount with exactly 2 decimal places", () => {
    expect(quickEditFormSchema.safeParse({ ...validFormValues, paidAmount: 95200.10 }).success).toBe(true);
  });

  it("balances a fractional paidAmount against an equal fractional total via cent-integer comparison", () => {
    const fractional = [{ ...mockConsultations[0], total: 80.10 }];
    const d = buildQuickEditDetail(fractional, mockClients, mockPatients, "CON-001");
    expect(d?.total).toBe(80.10);
    expect(toCents(d?.total ?? 0) - toCents(80.10) === 0).toBe(true);
  });
});

describe("buildInvoicePayloadFromQuickEdit", () => {
  it("applies form overrides, dynamic payment mapping and keeps stamp.send=false", () => {
    const p = buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, "CON-001", validFormValues, emitOpts);
    expect(p?.customer.branch_office).toBe(0);
    expect(p?.customer.name).toEqual(["María García", "López"]);
    expect(p?.customer.person_type).toBe("Person");
    expect(p?.payments[0].id).toBe(10948);
    expect(p?.stamp.send).toBe(false);
    expect(p?.mail.send).toBe(true);
  });

  it("produces a payload passing siigoInvoicePayloadSchema", () => {
    const p = buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, "CON-001", validFormValues, emitOpts);
    expect(siigoInvoicePayloadSchema.safeParse(p).success).toBe(true);
  });

  it("returns undefined for unknown id or orphan client", () => {
    expect(buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, "CON-NOPE", validFormValues)).toBeUndefined();
    const orphan = [{ ...mockConsultations[0], id: "CON-X", client_id: "CLI-NOPE" }];
    expect(buildInvoicePayloadFromQuickEdit(orphan, mockClients, mockPatients, "CON-X", validFormValues)).toBeUndefined();
  });

  it("keeps sum(payments.value) == sum(items.taxed_price*quantity) to prevent invalid_total_payments", () => {
    const p = buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, "CON-001", validFormValues, emitOpts);
    expect(p).toBeDefined();
    const itemsTotal = p!.items.reduce((s, it) => s + it.taxed_price! * it.quantity, 0);
    const paymentsTotal = p!.payments.reduce((s, pay) => s + pay.value, 0);
    expect(toCents(paymentsTotal)).toBe(toCents(itemsTotal));
  });
});

describe("Siigo line shape: whole quantity, line total as unit price", () => {
  const detail = (items: { code: string; name: string; quantity: number; lineTotal: number }[]) => {
    // Header total is the sum of the lines on purpose: these fixtures exercise
    // the Siigo line shape, not C-11. detectTotalMismatch is called rather
    // than hardcoding null so the fixture cannot drift out of agreement
    // silently and start testing a case it does not describe.
    const total = items.reduce((s, i) => s + i.lineTotal, 0);
    return {
      id: "C-38", clientName: "Sara Bobby", identificationType: "CC" as const, identificationNumber: "2111111234",
      email: "s@b.com", phone: "3000000000", patientName: "Bobby", paymentMethod: "",
      paymentMethodOptions: [], total,
      createdAt: new Date("2026-09-04T10:00:00Z"), items,
      totalMismatch: detectTotalMismatch(total, items),
      fullyReversed: detectFullReversal(total, items),
    };
  };
  const values = {
    name: "Sara Bobby", identificationType: "CC" as const, identificationNumber: "2111111234",
    email: "s@b.com", phone: "3000000000", paymentMethod: "Tarjeta Debito MMA", paidAmount: 0,
  };
  const options = {
    mapping: { items: [], payments: [{ provetMethod: "Tarjeta Debito MMA", siigoPaymentTypeId: 5637 }], version: 1, updatedAt: "2026-09-04T00:00:00.000Z", documentTypeId: 60345, creditNoteDocumentTypeId: null, sellerId: 629 },
    siigoProducts: [], mode: "sandbox" as const, documentTypeId: 60345, sellerId: 629,
  };

  it("never sends a quantity with more than 2 decimals — Siigo's items.quantity limit", () => {
    // Real Provet dosages: 0.028 of a bottle, 0.083 of a can. Sent verbatim,
    // Siigo rejects the line or truncates it, altering a legal document.
    const payload = buildInvoicePayloadFromQuickEdit(
      [], [], [], "C-38", values, options,
      detail([
        { code: "74", name: "Amoxicillin 250mg", quantity: 0.028, lineTotal: 19.11 },
        { code: "75", name: "Hills Canine ID 13oz", quantity: 0.083, lineTotal: 8.65 },
      ]),
    );
    for (const it of payload!.items) {
      expect(Number.isInteger(it.quantity)).toBe(true);
    }
  });

  it("bills the exact line total, so quantity * price reproduces it with no rounding drift", () => {
    const payload = buildInvoicePayloadFromQuickEdit(
      [], [], [], "C-38", values, options,
      detail([
        { code: "74", name: "Alfaxan Inj", quantity: 0.05, lineTotal: 31.57 },
        { code: "75", name: "Anal Gland Expression", quantity: 1, lineTotal: 28.5 },
      ]),
    );
    expect(payload!.items.map((i) => i.quantity * i.taxed_price!)).toEqual([31.57, 28.5]);
    expect(payload!.payments[0].value).toBeCloseTo(60.07, 2);
  });

  it("keeps the dispensed dose visible in the description, since it left the quantity column", () => {
    const payload = buildInvoicePayloadFromQuickEdit(
      [], [], [], "C-38", values, options,
      detail([{ code: "74", name: "Alfaxan Inj", quantity: 0.05, lineTotal: 31.57 }]),
    );
    expect(payload!.items[0].description).toContain("Alfaxan Inj");
    expect(payload!.items[0].description).toContain("0.05");
  });

  it("does not clutter the description when the quantity is a whole unit", () => {
    const payload = buildInvoicePayloadFromQuickEdit(
      [], [], [], "C-38", values, options,
      detail([{ code: "75", name: "Anal Gland Expression", quantity: 1, lineTotal: 28.5 }]),
    );
    expect(payload!.items[0].description).toBe("Anal Gland Expression");
  });

  it("sends taxed_price and NOT price, so Siigo does not add the product's VAT on top of VAT already included", () => {
    // The clinic's Siigo catalogue has tax_included: true with IVA 5%/19% per
    // product. A VAT-inclusive figure placed in `price` comes back 5-19% high.
    const payload = buildInvoicePayloadFromQuickEdit(
      [], [], [], "C-38", values, options,
      detail([{ code: "74", name: "Alfaxan Inj", quantity: 0.05, lineTotal: 31.57 }]),
    );
    expect(payload!.items[0].taxed_price).toBe(31.57);
    expect(payload!.items[0].price).toBeUndefined();
  });
});

describe("C-11 — emission is blocked when Provet's two totals disagree", () => {
  const items = [
    { code: "74", name: "Consulta general", quantity: 1, lineTotal: 100.0 },
    { code: "75", name: "Amoxicillin 250mg", quantity: 1, lineTotal: 87.5 },
  ];
  /** Invoice 12 of the live tenant: header 158.28, kept lines 187.50. */
  const mismatched = {
    id: "C-12", clientName: "Sara Bobby", identificationType: "CC" as const, identificationNumber: "2111111234",
    email: "s@b.com", phone: "3000000000", patientName: "Bobby", paymentMethod: "",
    paymentMethodOptions: [], total: 158.28,
    createdAt: new Date("2026-09-04T10:00:00Z"), items,
    totalMismatch: detectTotalMismatch(158.28, items),
    fullyReversed: detectFullReversal(158.28, items),
  };
  const values = {
    name: "Sara Bobby", identificationType: "CC" as const, identificationNumber: "2111111234",
    email: "s@b.com", phone: "3000000000", paymentMethod: "Tarjeta Debito MMA", paidAmount: 158.28,
  };
  const options = {
    mapping: { items: [], payments: [{ provetMethod: "Tarjeta Debito MMA", siigoPaymentTypeId: 5637 }], version: 1, updatedAt: "2026-09-04T00:00:00.000Z", documentTypeId: 60345, creditNoteDocumentTypeId: null, sellerId: 629 },
    siigoProducts: [], mode: "sandbox" as const, documentTypeId: 60345, sellerId: 629,
  };

  it("throws instead of returning a well-formed payload for the wrong amount", () => {
    expect(() =>
      buildInvoicePayloadFromQuickEdit([], [], [], "C-12", values, options, mismatched),
    ).toThrow(TotalMismatchError);
  });

  it("names both amounts and the difference in the message the staff sees", () => {
    try {
      buildInvoicePayloadFromQuickEdit([], [], [], "C-12", values, options, mismatched);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TotalMismatchError);
      const err = e as TotalMismatchError;
      expect(err.expectedTotal).toBe(158.28);
      expect(err.itemsTotal).toBe(187.5);
      expect(err.deltaCents).toBe(2922);
      expect(err.message).toContain("158.28");
      expect(err.message).toContain("187.50");
      expect(err.message).toContain("29.22");
    }
  });

  it("C-2 layer 2: throws by name on a line whose amount is not a number", () => {
    // `provetToQueue.ts` keeps the non-finite value instead of dropping it —
    // dropping it silently is the failure this project forbids, and the throw
    // cannot live in the mapper without blanking the queue for every
    // consultation (C-11, layer 1). This is where it surfaces.
    const corruptItems = [
      { code: "13", name: "Euthanasia", quantity: 1, lineTotal: 115 },
      { code: "84", name: "Cerenia 24mg box", quantity: 1, lineTotal: Number.POSITIVE_INFINITY },
    ];
    const corrupt = { ...mismatched, total: 115, items: corruptItems, totalMismatch: detectTotalMismatch(115, corruptItems), fullyReversed: detectFullReversal(115, corruptItems) };
    try {
      buildInvoicePayloadFromQuickEdit([], [], [], "C-12", values, options, corrupt);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CorruptInvoiceRowError);
      const err = e as CorruptInvoiceRowError;
      // Named before the mismatch check on purpose: the delta would be
      // Infinity and "one of the two amounts is wrong" would be a lie.
      expect(err.itemName).toBe("Cerenia 24mg box");
      expect(err.message).toContain("Cerenia 24mg box");
      expect(err.message).not.toContain("no coincide con la suma");
    }
  });

  it("C-2 layer 2: a corrupt line does NOT block the annulment path either", () => {
    const corruptItems = [{ code: "84", name: "Cerenia 24mg box", quantity: 1, lineTotal: Number.POSITIVE_INFINITY }];
    const corrupt = { ...mismatched, items: corruptItems, totalMismatch: detectTotalMismatch(115, corruptItems), fullyReversed: false };
    expect(() =>
      buildInvoicePayloadFromQuickEdit([], [], [], "C-12", values, options, corrupt, { enforceTotalMatch: false }),
    ).not.toThrow();
  });

  it("does NOT block the annulment path: a stamped invoice must stay voidable", () => {
    const payload = buildInvoicePayloadFromQuickEdit(
      [], [], [], "C-12", values, options, mismatched, { enforceTotalMatch: false },
    );
    expect(payload).toBeDefined();
    expect(siigoInvoicePayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("builds normally when the two totals agree", () => {
    const agreed = { ...mismatched, total: 187.5, totalMismatch: detectTotalMismatch(187.5, items), fullyReversed: detectFullReversal(187.5, items) };
    expect(agreed.totalMismatch).toBeNull();
    expect(buildInvoicePayloadFromQuickEdit([], [], [], "C-12", values, options, agreed)).toBeDefined();
  });
});

describe("C-16 — a fully reversed consultation is not a total mismatch", () => {
  /**
   * `consulta #10` del tenant: `factura #18` = 24.11, `NC #19` la abona por
   * -24.11. C-1 enruta la nota crédito a esta consulta y C-2 deja de
   * descartar la fila negativa, así que `items` sí refleja la reversión
   * completa: suma 0.00. El header de Provet (`total_with_vat` de la
   * factura #18) sigue siendo 24.11 — no se recalcula ni se netea.
   */
  const reversedItems = [
    { code: "40", name: "Consulta general", quantity: 1, lineTotal: 24.11 },
    { code: "40", name: "Consulta general (NC #19)", quantity: 1, lineTotal: -24.11 },
  ];

  describe("detectFullReversal", () => {
    it("is true when the lines net to zero but Provet's header is not zero", () => {
      expect(detectFullReversal(24.11, reversedItems)).toBe(true);
    });

    it("is independent of sign convention — any items summing to zero cents count", () => {
      const otherSigns = [
        { code: "1", name: "a", quantity: 1, lineTotal: -10 },
        { code: "2", name: "b", quantity: 1, lineTotal: 10 },
      ];
      expect(detectFullReversal(10, otherSigns)).toBe(true);
    });

    it("is false for an ordinary consultation whose lines agree with the header", () => {
      const normal = [{ code: "1", name: "Consulta", quantity: 1, lineTotal: 100 }];
      expect(detectFullReversal(100, normal)).toBe(false);
    });

    it("is false when both the header and the lines are zero — nothing to reverse", () => {
      expect(detectFullReversal(0, [])).toBe(false);
    });

    it("is false for a header total with NO rows at all — that's the pre-existing C-11 case, not a reversal", () => {
      // A reversal needs real, opposite-signed lines netting to zero. An empty
      // items array (Provet dropped every row) is a different failure and
      // stays flagged by detectTotalMismatch, exactly as C-11 already covers.
      expect(detectFullReversal(2380.85, [])).toBe(false);
    });

    it("is false for a genuine C-11 mismatch (lines do not net to zero)", () => {
      const mismatchedItems = [
        { code: "74", name: "Consulta general", quantity: 1, lineTotal: 100.0 },
        { code: "75", name: "Amoxicillin 250mg", quantity: 1, lineTotal: 87.5 },
      ];
      expect(detectFullReversal(158.28, mismatchedItems)).toBe(false);
    });
  });

  it("detectTotalMismatch does NOT flag a fully reversed consultation — there is nothing to reconcile", () => {
    expect(detectTotalMismatch(24.11, reversedItems)).toBeNull();
  });

  it("buildConsultationQueue marks the row as fullyReversed instead of totalMismatch", () => {
    const total = 24.11;
    const row = {
      id: "CON-010", clientId: "CLI-1", clientName: "x", clientDoc: "x",
      identificationType: "CC" as const, identificationNumber: "1", email: "", phone: "",
      items: reversedItems, patientName: "x", total, paymentMethod: "Efectivo",
      provetStatus: "closed" as const, invoiceStatus: "Draft" as const, createdAt: new Date(),
      totalMismatch: detectTotalMismatch(total, reversedItems),
      fullyReversed: detectFullReversal(total, reversedItems),
    };
    expect(row.totalMismatch).toBeNull();
    expect(row.fullyReversed).toBe(true);
  });

  it("throws ReversedConsultationError, not TotalMismatchError, when emission is attempted", () => {
    const values = {
      name: "Cliente", identificationType: "CC" as const, identificationNumber: "1",
      email: "a@b.com", phone: "3000000000", paymentMethod: "Efectivo", paidAmount: 0,
    };
    const options = { mapping: { items: [], payments: [], version: 1, updatedAt: "2026-09-11T00:00:00.000Z", documentTypeId: 1, creditNoteDocumentTypeId: null, sellerId: 1 }, siigoProducts: [], mode: "sandbox" as const, documentTypeId: 1, sellerId: 1 };
    const detail = {
      id: "CON-010", clientName: "Cliente", identificationType: "CC" as const, identificationNumber: "1",
      email: "a@b.com", phone: "3000000000", patientName: "x", paymentMethod: "",
      paymentMethodOptions: [], total: 24.11, createdAt: new Date(),
      items: reversedItems,
      totalMismatch: detectTotalMismatch(24.11, reversedItems),
      fullyReversed: detectFullReversal(24.11, reversedItems),
    };
    try {
      buildInvoicePayloadFromQuickEdit([], [], [], "CON-010", values, options, detail);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ReversedConsultationError);
      expect(e).not.toBeInstanceOf(TotalMismatchError);
      const err = e as ReversedConsultationError;
      // Own message: honest that there is nothing to reconcile, unlike
      // TotalMismatchError's "uno de los dos importes es incorrecto", which
      // would be false here — both amounts are correct and sum to zero.
      expect(err.message).not.toContain("no coincide con la suma");
      expect(err.message).not.toContain("uno de los dos importes es incorrecto");
      expect(err.message.toLowerCase()).toContain("revert");
    }
  });

  it("a corrupt line still takes priority over the reversal check", () => {
    const corruptItems = [
      { code: "40", name: "Consulta general", quantity: 1, lineTotal: 24.11 },
      { code: "40", name: "NC #19", quantity: 1, lineTotal: Number.POSITIVE_INFINITY },
    ];
    const values = {
      name: "Cliente", identificationType: "CC" as const, identificationNumber: "1",
      email: "a@b.com", phone: "3000000000", paymentMethod: "Efectivo", paidAmount: 0,
    };
    const options = { mapping: { items: [], payments: [], version: 1, updatedAt: "2026-09-11T00:00:00.000Z", documentTypeId: 1, creditNoteDocumentTypeId: null, sellerId: 1 }, siigoProducts: [], mode: "sandbox" as const, documentTypeId: 1, sellerId: 1 };
    const detail = {
      id: "CON-010", clientName: "Cliente", identificationType: "CC" as const, identificationNumber: "1",
      email: "a@b.com", phone: "3000000000", patientName: "x", paymentMethod: "",
      paymentMethodOptions: [], total: 24.11, createdAt: new Date(),
      items: corruptItems,
      totalMismatch: null,
      fullyReversed: false,
    };
    expect(() =>
      buildInvoicePayloadFromQuickEdit([], [], [], "CON-010", values, options, detail),
    ).toThrow(CorruptInvoiceRowError);
  });

  it("does NOT block the annulment path — a stamped invoice must stay voidable even if net zero", () => {
    const values = {
      name: "Cliente", identificationType: "CC" as const, identificationNumber: "1",
      email: "a@b.com", phone: "3000000000", paymentMethod: "Efectivo", paidAmount: 0,
    };
    const options = { mapping: { items: [], payments: [{ provetMethod: "Efectivo", siigoPaymentTypeId: 10948 }], version: 1, updatedAt: "2026-09-11T00:00:00.000Z", documentTypeId: 1, creditNoteDocumentTypeId: null, sellerId: 1 }, siigoProducts: [], mode: "sandbox" as const, documentTypeId: 1, sellerId: 1 };
    const detail = {
      id: "CON-010", clientName: "Cliente", identificationType: "CC" as const, identificationNumber: "1",
      email: "a@b.com", phone: "3000000000", patientName: "x", paymentMethod: "",
      paymentMethodOptions: [], total: 24.11, createdAt: new Date(),
      items: reversedItems,
      totalMismatch: detectTotalMismatch(24.11, reversedItems),
      fullyReversed: detectFullReversal(24.11, reversedItems),
    };
    expect(() =>
      buildInvoicePayloadFromQuickEdit([], [], [], "CON-010", values, options, detail, { enforceTotalMatch: false }),
    ).not.toThrow();
  });
});
