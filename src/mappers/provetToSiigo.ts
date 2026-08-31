import type { Consultation, Client, Patient } from "@/schemas/provet";
import type { SiigoInvoicePayload, SiigoProduct } from "@/schemas/siigo";
import { resolvePaymentTypeId, type CatalogMapping } from "@/mappers/catalogMapping";
import { stampSendFor, type EnvironmentMode } from "@/mappers/credentials";
import { buildSiigoCustomer } from "@/mappers/customerNormalizer";

/** Round strictly to 2 decimals (DIAN cent precision) — defeats float drift (e.g. 7763.980000000001). */
const round2 = (n: number): number => Number(Math.round(Number(`${n}e2`)) + "e-2");

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
  /** Active Siigo seller id (default: DEFAULT_SELLER_ID). */
  sellerId?: number;
  fallbackItemCode?: string;
}

/** Default Siigo invoice document type (Factura de Venta — explicit sandbox default, override via options.documentTypeId). */
export const DEFAULT_DOCUMENT_TYPE_ID = 2372;

/** Default Siigo seller id (explicit sandbox default — override via options.sellerId, never a credential). */
export const DEFAULT_SELLER_ID = 62;
export const DEFAULT_FALLBACK_ITEM_CODE = "FALLBACK-CVG-01";

/** Empty-catalog default — emission REQUIRES an explicit dynamic payment mapping. */
const DEFAULT_OPTIONS: ProvetToSiigoOptions = {
  mapping: { items: [], payments: [], version: 0, updatedAt: "1970-01-01T00:00:00.000Z" },
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

  const productIdByItemCode = new Map(
    mapping.items.map((m) => [m.provetCode, m.siigoProductId]),
  );
  const productById = new Map(siigoProducts.map((p) => [p.id, p]));

  const paymentTypeId = resolvePaymentTypeId(consultation.payment_method, mapping.payments);

  const stampSend = stampSendFor(mode);
    const fallbackItem = { name: "Consulta Veterinaria General", code: fallbackItemCode ?? DEFAULT_FALLBACK_ITEM_CODE, quantity: 1, unit_price: Math.max(consultation.total || 1, 1), tax_rate: 0, discount: 0 };
  const sourceItems = consultation.items.length > 0 ? consultation.items : [fallbackItem];
  const paymentValue = sumLineTotals(sourceItems);
  const date = new Date().toISOString().slice(0, 10);

  return {
    document: { id: documentTypeId ?? DEFAULT_DOCUMENT_TYPE_ID },
    date,
    customer: buildSiigoCustomer(client),
    seller: sellerId ?? DEFAULT_SELLER_ID,
    items: sourceItems.map((item) => {
      const productId = productIdByItemCode.get(item.code);
      const product = productId ? productById.get(productId) : undefined;
      return {
        code: product?.code ?? item.code,
        description: item.name,
        quantity: item.quantity,
        price: lineUnitPrice(item),
      };
    }),
    payments: [{ id: paymentTypeId, value: paymentValue }],
    stamp: { send: stampSend },
    mail: { send: stampSend },
  };
}