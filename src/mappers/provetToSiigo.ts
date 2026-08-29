import type { Consultation, Client, Patient } from "@/schemas/provet";
import type { SiigoInvoicePayload, SiigoProduct } from "@/schemas/siigo";
import { resolvePaymentTypeId, type CatalogMapping } from "@/mappers/catalogMapping";
import { stampSendFor, type EnvironmentMode } from "@/mappers/credentials";
import {
  buildSiigoName,
  cleanIdentification,
  mapIdentificationType,
  mapPersonType,
} from "@/mappers/customerNormalizer";

/** Round to 6 decimals (unit prices) — defeats float drift before reconciliation. */
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
/** Round to 2 decimals (totals/payments) — DIAN cent precision. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Dynamic emission context supplied by the caller (Settings UI state). */
export interface ProvetToSiigoOptions {
  /** User-editable catalog mapping — governs payments and product codes. */
  mapping: CatalogMapping;
  /** Active Siigo product catalog (source of product codes). */
  siigoProducts: SiigoProduct[];
  /** Environment mode — gates DIAN stamping via stampSendFor. */
  mode: EnvironmentMode;
  /** Active Siigo invoice document type id (default: DEFAULT_DOCUMENT_TYPE_ID). */
  documentTypeId?: number;
}

/** Default Siigo invoice document type (Factura de Venta — sandbox). */
export const DEFAULT_DOCUMENT_TYPE_ID = 2372;

/** Default Siigo seller id (sandbox fallback). */
export const DEFAULT_SELLER_ID = 62;

/** Empty-catalog default — emission REQUIRES an explicit dynamic payment mapping. */
const DEFAULT_OPTIONS: ProvetToSiigoOptions = {
  mapping: { items: [], payments: [], version: 0, updatedAt: "1970-01-01T00:00:00.000Z" },
  siigoProducts: [],
  mode: "sandbox",
};

/** Sum of emitted line totals (unit prices pre-rounded to 6 dp), rounded to 2 dp — equals Siigo's server-side total. */
const sumLineTotals = (items: Consultation["items"]): number =>
  round2(items.reduce((sum, it) => sum + round6(it.unit_price * (1 + it.tax_rate) - it.discount / it.quantity) * it.quantity, 0));

/**
 * Pure, side-effect-free transformation:
 *   Provet Consultation + Client + Patient → SiigoInvoicePayload.
 * Matches the official Siigo POST /v1/invoices (Invoice + Customer - Create)
 * collection: root `document`, `date`, `customer`, `seller`, `items`,
 * `payments`, `stamp`, `mail` — with NO `total` key. `payments[].id` resolves
 * exclusively from `options.mapping.payments` (unmapped methods throw
 * UnmappedPaymentMethodError). Customer emits flat
 * `identification`, `identification_type`, `person_type` and `branch_office: 0`;
 * items emit only `code`/`description`/`quantity`/`price`.
 */
export function provetToSiigoInvoice(
  consultation: Consultation,
  client: Client,
  patient: Patient,
  options: ProvetToSiigoOptions = DEFAULT_OPTIONS,
): SiigoInvoicePayload {
  void patient; // reserved for future audit/logging
  const { mapping, siigoProducts, mode, documentTypeId } = options;

  const productIdByItemCode = new Map(
    mapping.items.map((m) => [m.provetCode, m.siigoProductId]),
  );
  const productById = new Map(siigoProducts.map((p) => [p.id, p]));

  const paymentTypeId = resolvePaymentTypeId(consultation.payment_method, mapping.payments);

  const stampSend = stampSendFor(mode);
  const fallbackItem = { name: "Consulta Veterinaria General", code: "FALLBACK-CVG-01", quantity: 1, unit_price: Math.max(consultation.total || 1, 1), tax_rate: 0, discount: 0 };
  const sourceItems = consultation.items.length > 0 ? consultation.items : [fallbackItem];
  const paymentValue = sumLineTotals(sourceItems);
  const date = new Date(consultation.created_at).toISOString().slice(0, 10);

  return {
    document: { id: documentTypeId ?? DEFAULT_DOCUMENT_TYPE_ID },
    date,
    customer: {
      person_type: mapPersonType(client.client_type),
      identification_type: mapIdentificationType(client.identification.type),
      identification: cleanIdentification(client.identification.number),
      branch_office: 0,
      name: buildSiigoName(client.name || "Cliente sin nombre"),
    },
    seller: DEFAULT_SELLER_ID,
    items: sourceItems.map((item) => {
      const productId = productIdByItemCode.get(item.code);
      const product = productId ? productById.get(productId) : undefined;
      return {
        code: product?.code ?? item.code,
        description: item.name,
        quantity: item.quantity,
        price: round6(item.unit_price * (1 + item.tax_rate) - item.discount / item.quantity),
      };
    }),
    payments: [{ id: paymentTypeId, value: paymentValue }],
    stamp: { send: stampSend },
    mail: { send: true },
  };
}