import type { Consultation, Client, Patient } from "@/schemas/provet";
import { formatColombiaDate } from "@/schemas/provet";
import type { SiigoInvoicePayload, SiigoProduct, SiigoPaymentType } from "@/schemas/siigo";
import { resolvePaymentTypeId, type CatalogMapping } from "@/mappers/catalogMapping";
import { stampSendFor, type EnvironmentMode } from "@/mappers/credentials";
import { buildSiigoCustomer } from "@/mappers/customerNormalizer";

/** Round strictly to 2 decimals (DIAN cent precision) — defeats float drift (e.g. 7763.980000000001). */
const round2 = (n: number): number => Number(Math.round(Number(`${n}e2`)) + "e-2");

/**
 * Today's date as YYYY-MM-DD in Colombia time (UTC-5, no DST year-round).
 * `Date#toISOString()` returns UTC, which is already the next calendar day
 * in Colombia for roughly 7pm–midnight COT — DIAN invoice dates would then
 * silently record the wrong day for any consultation billed that evening.
 */
export function todayInColombia(): string {
  return formatColombiaDate(new Date());
}

/** Dynamic emission context supplied by the caller (Settings UI state). */
export interface ProvetToSiigoOptions {
  /** User-editable catalog mapping — governs payments and product codes. */
  mapping: CatalogMapping;
  /** Active Siigo product catalog (source of product codes). */
  siigoProducts: SiigoProduct[];
  /**
   * Active Siigo payment-type catalog — H-6. Used only to check the mapped
   * payment type's `due_date` flag before emission; optional and defaults to
   * empty so existing callers/tests that don't exercise this guard are
   * unaffected (the guard simply can't fire without the catalog, matching
   * today's behavior).
   */
  siigoPaymentTypes?: SiigoPaymentType[];
  /** Environment mode — gates DIAN stamping via stampSendFor. */
  mode: EnvironmentMode;
  /** Active Siigo invoice document type id — required, throws MissingEmissionSettingError if not configured in Ajustes. */
  documentTypeId?: number;
  /** Active Siigo seller id — required, throws MissingEmissionSettingError if not configured in Ajustes. */
  sellerId?: number;
  fallbackItemCode?: string;
}

/** Thrown when the account's Siigo document type or seller has not been configured in Ajustes → Mapeo. Never silently falls back to another account's id. */
export class MissingEmissionSettingError extends Error {
  readonly setting: "documentTypeId" | "sellerId";
  constructor(setting: "documentTypeId" | "sellerId") {
    const label = setting === "documentTypeId" ? "el tipo de comprobante (Factura de Venta)" : "el vendedor";
    super(`Falta configurar ${label} de Siigo. Vaya a Ajustes → Mapeo de Catálogo y sincronice/seleccione el valor antes de emitir.`);
    this.name = "MissingEmissionSettingError";
    this.setting = setting;
  }
}

/**
 * Thrown when a consultation carries no billable line and no honest substitute
 * exists. Emission stops here rather than inventing content for a document
 * that is legally binding once the DIAN stamps it.
 *
 * The two cases this replaces both fabricated data silently:
 *   - `code: fallbackItemCode ?? "FALLBACK-CVG-01"` — a placeholder code that
 *     does not exist in the clinic's Siigo catalogue.
 *   - `unit_price: Math.max(consultation.total || 1, 1)` — a one-peso invoice
 *     conjured out of a zero total.
 *
 * Measured against the live Provet tenant: 5 of 39 consultations have no
 * invoice line at all, so this is a real path, not a theoretical one.
 */
export class EmptyConsultationError extends Error {
  readonly reason: "no_fallback_configured" | "no_amount";
  constructor(reason: "no_fallback_configured" | "no_amount") {
    super(
      reason === "no_fallback_configured"
        ? "Esta consulta no tiene ítems facturables en Provet y no hay un código de producto de respaldo configurado. " +
          "Registre los ítems en Provet, o configure el código de respaldo en Ajustes → Mapeo de Catálogo."
        : "Esta consulta no tiene ítems facturables en Provet y su total es $0. " +
          "No se puede emitir una factura sin monto: registre los ítems o el valor de la consulta en Provet.",
    );
    this.name = "EmptyConsultationError";
    this.reason = reason;
  }
}

/**
 * H-6 — thrown when the mapped Siigo payment type manages a due date
 * (`due_date: true` in the catalog). Siigo's contract requires
 * `payments[].due_date` in that case and rejects the document with
 * `parameter_required` otherwise; this integration has no source for a due
 * date (Provet consultations carry none), so emission stops here rather than
 * either inventing a date or letting the client burn an Idempotency-Key on a
 * guaranteed Siigo rejection. Verified: `due_date` appears nowhere else in
 * `src/` — it was read from the catalog and discarded (N4/H-6).
 */
export class PaymentTypeRequiresDueDateError extends Error {
  readonly siigoPaymentTypeId: number;
  constructor(siigoPaymentTypeId: number) {
    super(
      `El medio de pago mapeado (Siigo #${siigoPaymentTypeId}) maneja fecha de vencimiento (crédito/financiación), que esta integración no soporta todavía. Mapee la consulta a un medio de pago sin vencimiento (efectivo, tarjeta) o facture manualmente en Siigo.`,
    );
    this.name = "PaymentTypeRequiresDueDateError";
    this.siigoPaymentTypeId = siigoPaymentTypeId;
  }
}

/**
 * C-2 — thrown when a line of this consultation carries a `sum_total` that is
 * not a finite number. Corrupt input, and the one thing that must never happen
 * to it is a silent `continue`: the amount would vanish from the invoice and
 * the remaining lines would reconcile with the header, leaving nothing for any
 * guard to catch.
 *
 * The detection lives in `provetToQueue.ts`, which KEEPS the value instead of
 * dropping it; this is the second layer, at the payload boundary. Splitting it
 * that way is deliberate: `buildQueueFromProvet` must not throw, or one bad row
 * blanks the queue for every consultation (C-11, `PROJECT_STATE.md ->
 * Resolved sesion 2`, layer 1).
 *
 * Only `Infinity` gets this far. `NaN` and non-numeric strings are rejected by
 * `provetInvoiceRowRawSchema`, and since the rows are parsed with a single
 * `safeParse` over the whole page, one of those already fails the entire fetch
 * with `ProvetApiError("parse_failed")`.
 */
export class CorruptInvoiceRowError extends Error {
  readonly itemName: string;
  readonly lineTotal: number;
  constructor(itemName: string, lineTotal: number) {
    super(
      `La línea "${itemName}" de esta consulta llega desde Provet con un importe que no es un número ` +
        `(${String(lineTotal)}). No se emite: el dato está corrupto en origen y facturar sin él dejaría ` +
        `la factura incompleta en silencio. Revise esa línea en Provet Cloud antes de continuar.`,
    );
    this.name = "CorruptInvoiceRowError";
    this.itemName = itemName;
    this.lineTotal = lineTotal;
  }
}

/**
 * C-11 — thrown when Provet's own two accounts of the same consultation
 * disagree: the invoice header (`total_with_vat`) against the invoice rows
 * (`sum_total`). One of the two is wrong and nothing in this codebase can tell
 * which, so neither may be stamped: whichever we picked, we would be picking
 * blind on a document that is legally binding once the DIAN accepts it.
 *
 * Measured on the live tenant 2026-09-11: 7 of 52 invoices disagree today, all
 * of them for the same reason (C-2, the `sum_total <= 0` filter). Invoice 12 is
 * the one that matters — a positive, non-credit-note document where the code
 * would bill 187.50 against a header of 158.28.
 */
export class TotalMismatchError extends Error {
  readonly expectedTotal: number;
  readonly itemsTotal: number;
  readonly deltaCents: number;
  constructor(m: { expectedTotal: number; itemsTotal: number; deltaCents: number }) {
    const fmt = (n: number) => n.toFixed(2);
    super(
      `El total de Provet para esta consulta (${fmt(m.expectedTotal)}) no coincide con la suma de sus líneas ` +
        `(${fmt(m.itemsTotal)}); diferencia de ${fmt(m.deltaCents / 100)}. No se emite: uno de los dos importes es ` +
        `incorrecto y no hay forma de saber cuál. Revise la factura en Provet Cloud antes de continuar.`,
    );
    this.name = "TotalMismatchError";
    this.expectedTotal = m.expectedTotal;
    this.itemsTotal = m.itemsTotal;
    this.deltaCents = m.deltaCents;
  }
}

/**
 * C-16 — thrown for a consultation that was billed and then reversed in
 * full: an invoice and a credit note that cancel each other to the cent.
 * `detectFullReversal` (in `consultationQueue.ts`) is what tells this apart
 * from `TotalMismatchError` — Σ items == 0 while Provet's header keeps the
 * original, pre-reversal amount. Both numbers are correct here; there is
 * simply nothing left to invoice, which is a different situation from "one
 * of the two is wrong and we cannot tell which."
 *
 * `TotalMismatchError`'s message ("uno de los dos importes es incorrecto")
 * would be false in this case, so this gets its own name and its own
 * message rather than reusing that guard's output — see `PROJECT_STATE.md`,
 * hallazgo C-16.
 */
export class ReversedConsultationError extends Error {
  readonly expectedTotal: number;
  constructor(expectedTotal: number) {
    super(
      `Esta consulta fue facturada por ${expectedTotal.toFixed(2)} y luego revertida por completo con una nota ` +
        `crédito por el mismo importe: las líneas que quedan suman $0.00. No hay factura que emitir ni descuadre que ` +
        `revisar — ambos importes de Provet son correctos.`,
    );
    this.name = "ReversedConsultationError";
    this.expectedTotal = expectedTotal;
  }
}

/** Empty-catalog default — emission REQUIRES an explicit dynamic payment mapping. */
const DEFAULT_OPTIONS: ProvetToSiigoOptions = {
  mapping: { items: [], payments: [], version: 0, updatedAt: "1970-01-01T00:00:00.000Z", documentTypeId: null, creditNoteDocumentTypeId: null, sellerId: null },
  siigoProducts: [],
  mode: "sandbox",
};

/** Per-item rounded unit price (tax-inclusive, discount-adjusted) at 2 dp. */
const lineUnitPrice = (it: Consultation["items"][number]): number =>
  round2(it.unit_price * (1 + it.tax_rate) - it.discount / it.quantity);

/** Payment total = exact sum of rounded `price * quantity` so sum(payments) == sum(items) with zero divergence. */
const sumLineTotals = (items: Consultation["items"]): number =>
  round2(items.reduce((sum, it) => sum + lineUnitPrice(it) * it.quantity, 0));

export function provetToSiigoInvoice(
  consultation: Consultation,
  client: Client,
  patient: Patient,
  options: ProvetToSiigoOptions = DEFAULT_OPTIONS,
): SiigoInvoicePayload {
  void patient; // reserved for future audit/logging
  const { mapping, siigoProducts, mode, documentTypeId, sellerId, fallbackItemCode, siigoPaymentTypes = [] } = options;
  if (documentTypeId === undefined) throw new MissingEmissionSettingError("documentTypeId");
  if (sellerId === undefined) throw new MissingEmissionSettingError("sellerId");

  const productIdByItemCode = new Map(
    mapping.items.map((m) => [m.provetCode, m.siigoProductId]),
  );
  const productById = new Map(siigoProducts.map((p) => [p.id, p]));

  const paymentTypeId = resolvePaymentTypeId(consultation.payment_method, mapping.payments);
  // H-6: block emission rather than let Siigo reject the document with
  // parameter_required for a payment type this integration cannot supply a
  // due_date for.
  const mappedPaymentType = siigoPaymentTypes.find((pt) => pt.id === paymentTypeId);
  if (mappedPaymentType?.due_date) throw new PaymentTypeRequiresDueDateError(paymentTypeId);

  const stampSend = stampSendFor(mode);
  // No lines: fall back ONLY to an explicitly configured product code and a
  // real consultation total. Anything else stops emission — see
  // EmptyConsultationError for why each branch used to be a silent fabrication.
  let sourceItems = consultation.items;
  if (sourceItems.length === 0) {
    if (!fallbackItemCode) throw new EmptyConsultationError("no_fallback_configured");
    if (!(consultation.total > 0)) throw new EmptyConsultationError("no_amount");
    sourceItems = [{
      name: "Consulta Veterinaria General",
      code: fallbackItemCode,
      quantity: 1,
      unit_price: consultation.total,
      tax_rate: 0,
      discount: 0,
    }];
  }
  const paymentValue = sumLineTotals(sourceItems);
  const date = todayInColombia();

  return {
    document: { id: documentTypeId },
    date,
    customer: buildSiigoCustomer(client),
    seller: sellerId,
    items: sourceItems.map((item) => {
      const productId = productIdByItemCode.get(item.code);
      const product = productId ? productById.get(productId) : undefined;
      // Siigo applies NO tax on its own: a line without an explicit `taxes`
      // array is stored with zero IVA even when the product is configured as
      // Taxed 19% (verified against the live API — a 19% product billed at
      // 100 came back as total 100.00, no tax line). A Colombian electronic
      // invoice must break the IVA out, so the mapped product's tax ids are
      // forwarded. Combined with `taxed_price` Siigo derives the taxable base
      // and the tax amount, leaving the total unchanged.
      const taxes = product?.taxes?.length
        ? product.taxes.map((t) => ({ id: t.id }))
        : undefined;
      return {
        code: product?.code ?? item.code,
        description: item.name,
        quantity: item.quantity,
        ...(taxes ? { taxes } : {}),
        // taxed_price, never price: the amount is already VAT-inclusive
        // (Provet's invoicerow.sum_total), and the clinic's Siigo products
        // carry their own IVA. See siigoInvoiceItemSchema for the full
        // rationale and why `price` is deliberately omitted rather than
        // sent alongside.
        taxed_price: lineUnitPrice(item),
      };
    }),
    payments: [{ id: paymentTypeId, value: paymentValue }],
    stamp: { send: stampSend },
    // mail.send is independent of stamp.send/mode: the customer should get their invoice copy
    // by email regardless of whether the invoice was stamped with the DIAN yet.
    mail: { send: true },
  };
}