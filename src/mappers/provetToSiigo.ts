import type { Consultation, Client, Patient } from "@/schemas/provet";
import type { SiigoInvoicePayload, SiigoProduct } from "@/schemas/siigo";
import type { CatalogMapping } from "@/mappers/catalogMapping";
import { stampSendFor, type EnvironmentMode } from "@/mappers/credentials";
import {
  buildSiigoName,
  cleanIdentification,
  cleanPhone,
  sanitizeEmail,
} from "@/mappers/customerNormalizer";

/** Round to 6 decimals (unit prices) — defeats float drift before reconciliation. */
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
/** Round to 2 decimals (totals/payments) — DIAN cent precision. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Siigo DIAN tax classification codes (derived from the invoice schema). */
type SiigoTaxCode =
  SiigoInvoicePayload["items"][number]["taxes"][number]["tax_code"];

/**
 * Maps a Provet tax_rate (0–1 range) to a Siigo DIAN tax classification code.
 * Fallback for items without a catalog mapping — a mapped Siigo product's
 * `tax_classification` always takes precedence.
 */
export function mapTaxRateToSiigo(taxRate: number): SiigoTaxCode {
  const map: Record<number, SiigoTaxCode> = {
    0.19: "IVA_19",
    0.05: "IVA_5",
    0: "EXENTO",
  };
  const result = map[taxRate];
  if (!result) {
    throw new Error(
      `Unsupported tax rate: ${taxRate}. ` +
        `Expected 0.19 (IVA_19), 0.05 (IVA_5), or 0 (EXENTO).`,
    );
  }
  return result;
}

/** Dynamic emission context supplied by the caller (Settings UI state). */
export interface ProvetToSiigoOptions {
  /** User-editable catalog mapping (Task 4.1) — governs payments and taxes. */
  mapping: CatalogMapping;
  /** Active Siigo product catalog (source of tax_classification + codes). */
  siigoProducts: SiigoProduct[];
  /** Environment mode (Task 4.2) — gates DIAN stamping via stampSendFor. */
  mode: EnvironmentMode;
}

/**
 * Legacy static payment lookup — default for Phase 3 callers that have not
 * been wired to the Settings catalog mapping yet. New code must pass dynamic
 * `ProvetToSiigoOptions` instead of relying on this constant.
 */
export const PAYMENT_METHOD_MAP: Record<string, string> = {
  Bancolombia: "PT-001",
  Davivienda: "PT-002",
  Efectivo: "PT-003",
};

/** Sandbox-safe defaults reproducing the pre-Task-4.3 static behavior. */
const DEFAULT_OPTIONS: ProvetToSiigoOptions = {
  mapping: {
    items: [],
    payments: Object.entries(PAYMENT_METHOD_MAP).map(
      ([provetMethod, siigoPaymentTypeId]) => ({ provetMethod, siigoPaymentTypeId }),
    ),
    version: 0,
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
  siigoProducts: [],
  mode: "sandbox",
};

/**
 * Pure, side-effect-free transformation:
 *   Provet Consultation + Client + Patient → SiigoInvoicePayload.
 *
 * The user-editable CatalogMapping governs emission:
 *   - Payments resolve through `mapping.payments` (unmapped methods throw).
 *   - Item taxes resolve through `mapping.items` → Siigo product
 *     `tax_classification` (takes precedence over the Provet tax_rate);
 *     unmapped or stale-product items fall back to the rate-derived code.
 *   - Mapped items emit the Siigo product `code`; unmapped keep the Provet one.
 *
 * `stamp.send` derives from `stampSendFor(mode)` (sandbox stays false), while
 * `mail.send` is always true to trigger Siigo client email dispatch.
 */
export function provetToSiigoInvoice(
  consultation: Consultation,
  client: Client,
  patient: Patient,
  options: ProvetToSiigoOptions = DEFAULT_OPTIONS,
): SiigoInvoicePayload {
  void patient; // reserved for future audit/logging
  const { mapping, siigoProducts, mode } = options;

  const paymentByMethod = new Map(
    mapping.payments.map((p) => [p.provetMethod, p.siigoPaymentTypeId]),
  );
  const productIdByItemCode = new Map(
    mapping.items.map((m) => [m.provetCode, m.siigoProductId]),
  );
  const productById = new Map(siigoProducts.map((p) => [p.id, p]));

  const paymentTypeId =
    paymentByMethod.get(consultation.payment_method) ??
    PAYMENT_METHOD_MAP["Efectivo"] ??
    "PT-003";

  const stampSend = stampSendFor(mode);
  const fallbackItem = { name: "Consulta Veterinaria General", code: "FALLBACK-CVG-01", quantity: 1, unit_price: Math.max(consultation.total || 1, 1), tax_rate: 0, discount: 0 };
  const sourceItems = consultation.items.length > 0 ? consultation.items : [fallbackItem];
  const effectiveTotal = consultation.items.length > 0 ? consultation.total : fallbackItem.unit_price;
  return {
    customer: {
      identification: cleanIdentification(
        client.identification.type,
        client.identification.number,
      ),
      name: buildSiigoName(client.name || "Cliente sin nombre"),
      email: sanitizeEmail(client.email || "sin-correo@placeholder.local"),
      phone: cleanPhone(client.phone || "0000000"),
    },
    items: sourceItems.map((item) => {
      const productId = productIdByItemCode.get(item.code);
      const product = productId ? productById.get(productId) : undefined;
      return {
        code: product?.code ?? item.code,
        description: item.name,
        quantity: item.quantity,
        price: round6(item.unit_price * (1 + item.tax_rate) - item.discount / item.quantity),
        taxes: [
          { tax_code: product?.tax_classification ?? mapTaxRateToSiigo(item.tax_rate) },
        ],
      };
    }),
    payments: [
      {
        payment_type_id: paymentTypeId,
        amount: round2(effectiveTotal),
        paid_date: consultation.updated_at,
      },
    ],
    total: round2(effectiveTotal),
    stamp: { send: stampSend },
    mail: { send: true },
  };
}
