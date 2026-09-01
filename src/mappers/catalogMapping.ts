import { z } from "zod";
import type { Consultation } from "@/schemas/provet";
import type { SiigoProduct, SiigoPaymentType, SiigoDocumentTypeCatalogEntry, SiigoSeller } from "@/schemas/siigo";

export const itemMappingSchema = z.object({
  provetCode: z.string().trim().min(1),
  siigoProductId: z.string().trim().min(1).nullable(),
});
export const paymentMappingSchema = z.object({
  provetMethod: z.string().trim().min(1),
  siigoPaymentTypeId: z.number().int().positive().nullable(),
});
export const catalogMappingSchema = z.object({
  items: z.array(itemMappingSchema),
  payments: z.array(paymentMappingSchema),
  version: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
  /** Active Siigo invoice (FV) document type id — account-specific, set in Ajustes. */
  documentTypeId: z.number().int().positive().nullable().default(null),
  /** Active Siigo credit-note (NC) document type id — account-specific, set in Ajustes. */
  creditNoteDocumentTypeId: z.number().int().positive().nullable().default(null),
  /** Active Siigo seller/user id — account-specific, set in Ajustes. */
  sellerId: z.number().int().positive().nullable().default(null),
});
export type ItemMapping = z.infer<typeof itemMappingSchema>;
export type PaymentMapping = z.infer<typeof paymentMappingSchema>;
export type CatalogMapping = z.infer<typeof catalogMappingSchema>;

export interface ItemMappingRow {
  provetCode: string;
  provetName: string;
  siigoProductId: string | null;
  siigoProductName: string | null;
  siigoTaxClassification: SiigoProduct["tax_classification"] | null;
  siigoUnitName: string | null;
  mapped: boolean;
  /** True when a product is mapped but its name shares no significant word with the Provet item name. */
  lowConfidence: boolean;
}
export interface PaymentMappingRow {
  provetMethod: string;
  siigoPaymentTypeId: number | null;
  siigoPaymentTypeName: string | null;
  siigoPaymentCategory: SiigoPaymentType["type"] | null;
  /** Whether the currently-mapped Siigo payment type is enabled ("En uso" in Siigo Nube). Null when unmapped. */
  siigoPaymentActive: boolean | null;
  mapped: boolean;
}

type ProvetItemRef = { code: string; name: string };

const norm = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** Words of length >=3 to ignore noise from short connector words. */
const significantWords = (s: string): string[] => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
export function nameSimilarity(a: string, b: string): number {
  const wa = new Set(significantWords(a));
  const wb = new Set(significantWords(b));
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.max(wa.size, wb.size);
}
/** Siigo products ranked by name similarity to a Provet item name, best match first (ties keep original order). */
export function rankSiigoProductsFor(provetName: string, siigoProducts: SiigoProduct[]): SiigoProduct[] {
  return siigoProducts
    .map((p, i) => ({ p, i, score: nameSimilarity(provetName, p.name) }))
    .sort((x, y) => y.score - x.score || x.i - y.i)
    .map((x) => x.p);
}

/** Distinct Provet item {code,name}; first name wins; stable O(n). */
export function extractProvetItems(consultations: Consultation[]): ProvetItemRef[] {
  const seen = new Set<string>();
  const out: ProvetItemRef[] = [];
  for (const c of consultations) for (const it of c.items)
    if (!seen.has(it.code)) { seen.add(it.code); out.push({ code: it.code, name: it.name }); }
  return out;
}
/** Distinct Provet payment methods, stable insertion order. */
export function extractProvetPaymentMethods(consultations: Consultation[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of consultations)
    if (!seen.has(c.payment_method)) { seen.add(c.payment_method); out.push(c.payment_method); }
  return out;
}
/** Left-join provet items -> siigo products via mapping; stale ids -> unmapped. */
export function buildItemMappingRows(items: ProvetItemRef[], siigoProducts: SiigoProduct[], mapping: ItemMapping[]): ItemMappingRow[] {
  const byId = new Map(siigoProducts.map((p) => [p.id, p]));
  const byCode = new Map(mapping.map((m) => [m.provetCode, m.siigoProductId]));
  return items.map((it) => {
    const id = byCode.get(it.code) ?? null;
    const p = id ? byId.get(id) ?? null : null;
    return { provetCode: it.code, provetName: it.name, siigoProductId: p ? id : null,
      siigoProductName: p?.name ?? null, siigoTaxClassification: p?.tax_classification ?? null,
      siigoUnitName: p?.unit?.name ?? p?.unit?.code ?? null,
      mapped: Boolean(p), lowConfidence: Boolean(p) && nameSimilarity(it.name, p?.name ?? "") === 0 };
  });
}
/** Left-join provet methods -> siigo payment types via mapping; stale ids -> unmapped. */
export function buildPaymentMappingRows(methods: string[], siigoPaymentTypes: SiigoPaymentType[], mapping: PaymentMapping[]): PaymentMappingRow[] {
  const byId = new Map(siigoPaymentTypes.map((p) => [p.id, p]));
  const byMethod = new Map(mapping.map((m) => [m.provetMethod, m.siigoPaymentTypeId]));
  return methods.map((method) => {
    const id = byMethod.get(method) ?? null;
    const pt = id ? byId.get(id) ?? null : null;
    return { provetMethod: method, siigoPaymentTypeId: pt ? id : null,
      siigoPaymentTypeName: pt?.name ?? null, siigoPaymentCategory: pt?.type ?? null,
      siigoPaymentActive: pt?.active ?? null, mapped: Boolean(pt) };
  });
}
/** Auto-match items: exact code match first, else best name-similarity match (score > 0) so a plausible default is pre-selected instead of nothing. */
export function defaultItemMapping(items: ProvetItemRef[], siigoProducts: SiigoProduct[]): ItemMapping[] {
  const byCode = new Map(siigoProducts.map((p) => [p.code, p.id]));
  return items.map((it) => {
    const exact = byCode.get(it.code);
    if (exact) return { provetCode: it.code, siigoProductId: exact };
    const ranked = rankSiigoProductsFor(it.name, siigoProducts);
    const best = ranked[0];
    const bestScore = best ? nameSimilarity(it.name, best.name) : 0;
    return { provetCode: it.code, siigoProductId: bestScore > 0 ? best.id : null };
  });
}
/** Auto-match payment methods by normalized name containment (either direction). */
export function defaultPaymentMapping(methods: string[], siigoPaymentTypes: SiigoPaymentType[]): PaymentMapping[] {
  const ns = siigoPaymentTypes.map((pt) => ({ id: pt.id, n: norm(pt.name) }));
  return methods.map((method) => {
    const m = norm(method);
    return { provetMethod: method, siigoPaymentTypeId: ns.find((pt) => pt.n.includes(m) || m.includes(pt.n))?.id ?? null };
  });
}

/** Typed domain error: a consultation payment method has no valid Siigo Payment Type mapping. */
export class UnmappedPaymentMethodError extends Error {
  readonly paymentMethod: string;
  constructor(paymentMethod: string) {
    super(`Método de pago sin mapeo en el catálogo: "${paymentMethod}". Configúrelo en Ajustes → Mapeo de catálogos.`);
    this.name = "UnmappedPaymentMethodError";
    this.paymentMethod = paymentMethod;
  }
}

/** Strict O(n) lookup: mapped Siigo Payment Type id or UnmappedPaymentMethodError — no silent fallback. */
export function resolvePaymentTypeId(method: string, payments: PaymentMapping[]): number {
  const id = payments.find((p) => p.provetMethod === method)?.siigoPaymentTypeId ?? null;
  if (id === null) throw new UnmappedPaymentMethodError(method);
  return id;
}
const fresh = <T extends string | number>(id: T | null, valid: Set<T>): T | null =>
  id !== null && valid.has(id) ? id : null;
/**
 * Reconcile persisted mapping vs current catalogs: drop gone provet entries,
 * null stale siigo ids, add new. `version` is intentionally carried through
 * UNCHANGED — it is the server's optimistic-concurrency counter (see
 * /api/catalog-mapping PUT), and a local-only reconcile (e.g. after a
 * catalog sync that hasn't been saved yet) must not advance it. Advancing it
 * here would make the next Guardar send a version number the server never
 * issued, causing spurious 409 conflicts unrelated to any real concurrent edit.
 */
export function reconcileMapping(
  mapping: CatalogMapping,
  provetItems: ProvetItemRef[],
  siigoProducts: SiigoProduct[],
  provetMethods: string[],
  siigoPaymentTypes: SiigoPaymentType[],
  siigoDocumentTypes: SiigoDocumentTypeCatalogEntry[] = [],
  siigoSellers: SiigoSeller[] = [],
): CatalogMapping {
  const prodIds = new Set(siigoProducts.map((p) => p.id));
  const ptIds = new Set(siigoPaymentTypes.map((p) => p.id));
  const fvIds = new Set(siigoDocumentTypes.filter((d) => d.type === "FV").map((d) => d.id));
  const ncIds = new Set(siigoDocumentTypes.filter((d) => d.type === "NC").map((d) => d.id));
  const sellerIds = new Set(siigoSellers.map((s) => s.id));
  const oldItem = new Map(mapping.items.map((m) => [m.provetCode, m.siigoProductId]));
  const oldPay = new Map(mapping.payments.map((m) => [m.provetMethod, m.siigoPaymentTypeId]));
  return {
    items: provetItems.map((it) => ({ provetCode: it.code, siigoProductId: fresh(oldItem.get(it.code) ?? null, prodIds) })),
    payments: provetMethods.map((m) => ({ provetMethod: m, siigoPaymentTypeId: fresh(oldPay.get(m) ?? null, ptIds) })),
    documentTypeId: fresh(mapping.documentTypeId, fvIds),
    creditNoteDocumentTypeId: fresh(mapping.creditNoteDocumentTypeId, ncIds),
    sellerId: fresh(mapping.sellerId, sellerIds),
    version: mapping.version,
    updatedAt: new Date().toISOString(),
  };
}
/** Zod-validated JSON serialization for localStorage persistence. */
export function serializeCatalogMapping(mapping: CatalogMapping): string {
  return JSON.stringify(catalogMappingSchema.parse(mapping));
}
/** Parse + Zod-validate a stored JSON blob; throws on corrupt/invalid input. */
export function parseCatalogMapping(stored: string): CatalogMapping {
  return catalogMappingSchema.parse(JSON.parse(stored));
}