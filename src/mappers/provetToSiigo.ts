import type { Consultation, Client, Patient } from "@/schemas/provet";
import type { SiigoInvoicePayload, SiigoProduct } from "@/schemas/siigo";
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
function todayInColombia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

/** Dynamic emission context supplied by the caller (Settings UI state). */
export interface ProvetToSiigoOptions {
  /** User-editable catalog mapping — governs payments and product codes. */
  mapping: CatalogMapping;
  /** Active Siigo product catalog (source of product codes). */
  siigoProducts: SiigoProduct[];
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
  const { mapping, siigoProducts, mode, documentTypeId, sellerId, fallbackItemCode } = options;
  if (documentTypeId === undefined) throw new MissingEmissionSettingError("documentTypeId");
  if (sellerId === undefined) throw new MissingEmissionSettingError("sellerId");

  const productIdByItemCode = new Map(
    mapping.items.map((m) => [m.provetCode, m.siigoProductId]),
  );
  const productById = new Map(siigoProducts.map((p) => [p.id, p]));

  const paymentTypeId = resolvePaymentTypeId(consultation.payment_method, mapping.payments);

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
      return {
        code: product?.code ?? item.code,
        description: item.name,
        quantity: item.quantity,
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