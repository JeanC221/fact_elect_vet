import { z } from "zod";
import type { Consultation } from "@/schemas/provet";
import type { SiigoProduct, SiigoPaymentType } from "@/schemas/siigo";

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
  mapped: boolean;
}
export interface PaymentMappingRow {
  provetMethod: string;
  siigoPaymentTypeId: number | null;
  siigoPaymentTypeName: string | null;
  siigoPaymentCategory: SiigoPaymentType["type"] | null;
  mapped: boolean;
}

type ProvetItemRef = { code: string; name: string };

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
      siigoProductName: p?.name ?? null, siigoTaxClassification: p?.tax_classification ?? null, mapped: Boolean(p) };
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
      siigoPaymentTypeName: pt?.name ?? null, siigoPaymentCategory: pt?.type ?? null, mapped: Boolean(pt) };
  });
}
/** Auto-match items by exact code equality; others null. */
export function defaultItemMapping(items: ProvetItemRef[], siigoProducts: SiigoProduct[]): ItemMapping[] {
  const byCode = new Map(siigoProducts.map((p) => [p.code, p.id]));
  return items.map((it) => ({ provetCode: it.code, siigoProductId: byCode.get(it.code) ?? null }));
}
const norm = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** Auto-match payment methods by normalized name containment (either direction). */
export function defaultPaymentMapping(methods: string[], siigoPaymentTypes: SiigoPaymentType[]): PaymentMapping[] {
  const ns = siigoPaymentTypes.map((pt) => ({ id: pt.id, n: norm(pt.name) }));
  return methods.map((method) => {
    const m = norm(method);
    return { provetMethod: method, siigoPaymentTypeId: ns.find((pt) => pt.n.includes(m) || m.includes(pt.n))?.id ?? null };
  });
}
const fresh = <T extends string | number>(id: T | null, valid: Set<T>): T | null =>
  id !== null && valid.has(id) ? id : null;
/** Reconcile persisted mapping vs current catalogs: drop gone provet entries, null stale siigo ids, add new. */
export function reconcileMapping(mapping: CatalogMapping, provetItems: ProvetItemRef[], siigoProducts: SiigoProduct[], provetMethods: string[], siigoPaymentTypes: SiigoPaymentType[]): CatalogMapping {
  const prodIds = new Set(siigoProducts.map((p) => p.id));
  const ptIds = new Set(siigoPaymentTypes.map((p) => p.id));
  const oldItem = new Map(mapping.items.map((m) => [m.provetCode, m.siigoProductId]));
  const oldPay = new Map(mapping.payments.map((m) => [m.provetMethod, m.siigoPaymentTypeId]));
  return {
    items: provetItems.map((it) => ({ provetCode: it.code, siigoProductId: fresh(oldItem.get(it.code) ?? null, prodIds) })),
    payments: provetMethods.map((m) => ({ provetMethod: m, siigoPaymentTypeId: fresh(oldPay.get(m) ?? null, ptIds) })),
    version: mapping.version + 1,
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
