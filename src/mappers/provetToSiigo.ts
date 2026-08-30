import type { Consultation, Client, Patient } from "@/schemas/provet";
import type { SiigoInvoicePayload, SiigoProduct } from "@/schemas/siigo";
import { resolvePaymentTypeId, type CatalogMapping } from "@/mappers/catalogMapping";
import { stampSendFor, type EnvironmentMode } from "@/mappers/credentials";
import {
  buildSiigoContacts,
  buildSiigoName,
  cleanIdentification,
  mapIdentificationType,
  mapPersonType,
} from "@/mappers/customerNormalizer";

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

/** Kill JS float drift while preserving raw Provet decimals (2-decimal COP precision). */
const round2 = (n: number): number => Number(n.toFixed(2));

/**
 * Pure, side-effect-free transformation:
 *   Provet Consultation + Client + Patient – SiigoInvoicePayload.
 * Matches the official Siigo POST /v1/invoices (Invoice + Customer - Create)
 * collection: root `document`, `date`, `customer`, `seller`, `items`,
 * `payments`, `stamp`, `mail` — with NO `total` key. `payments[].id` resolves
 * exclusively from `options.mapping.payments` (unmapped methods throw
 * UnmappedPaymentMethodError). Customer emits flat `identification`,
 * `id_type`, `person_type`, `branch_office: 0`, a clean string-array `name`
 * and `contacts` (≥1 `{ first_name, last_name, email }`) when `mail.send`
 * is true. `items[].price` and `payments[].value` are formatted via
 * `Number(val.toFixed(2))` to kill JS float drift; the invariant
 * `payments[0].value === round2(Σ items[].price * quantity)` always holds.
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
  const fallbackItem = { name: "Consulta Veterinaria General", code: "9248", quantity: 1, unit_price: Math.max(consultation.total || 1, 1), tax_rate: 0, discount: 0 };
  const sourceItems = consultation.items.length > 0 ? consultation.items : [fallbackItem];
  const date = new Date(consultation.created_at).toISOString().slice(0, 10);

  const items = sourceItems.map((item) => {
    const productId = productIdByItemCode.get(item.code);
    const product = productId ? productById.get(productId) : undefined;
    return {
      code: product?.code ?? item.code,
      description: item.name,
      quantity: item.quantity,
      price: round2(item.unit_price * (1 + item.tax_rate) - item.discount / item.quantity),
    };
  });

  const total = round2(items.reduce((sum, it) => sum + it.price * it.quantity, 0));
  const mailSend = true;

  return {
    document: { id: documentTypeId ?? DEFAULT_DOCUMENT_TYPE_ID },
    date,
    customer: {
      person_type: mapPersonType(client.client_type),
      id_type: mapIdentificationType(client.identification.type),
      identification: cleanIdentification(client.identification.number),
      branch_office: 0,
      name: buildSiigoName(client.name || "Cliente sin nombre"),
      ...(mailSend ? { contacts: buildSiigoContacts(client.name || "Cliente sin nombre", client.email) } : {}),
    },
    seller: DEFAULT_SELLER_ID,
    items,
    payments: [{ id: paymentTypeId, value: total }],
    stamp: { send: stampSend },
    mail: { send: mailSend },
  };
}
