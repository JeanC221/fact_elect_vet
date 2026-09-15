import { parseCatalogMapping, catalogMappingSchema, type CatalogMapping } from "@/mappers/catalogMapping";
import { environmentModeSchema, type EnvironmentMode } from "@/mappers/credentials";
import { parseCachedMode, type CachedModeRead } from "@/mappers/emissionModeState";
import { mockSiigoProducts } from "@/mocks/siigo";
import type { SiigoProduct } from "@/schemas/siigo";
import type { SiigoPaymentType } from "@/schemas/siigo";
import { apiRequest } from "@/services/apiClient";

/**
 * Browser-storage and network access for `useEmissionOptions`.
 *
 * Extracted verbatim from the hook so the hook stays under the file-size cap
 * and so the decision logic can live in a pure, node-testable mapper
 * (`@/mappers/emissionModeState`). Every read below behaves exactly as it did
 * inline: same keys, same order, same fallbacks. The single intentional change
 * is that the mode read now returns a discriminated `CachedModeRead` instead
 * of collapsing "absent", "corrupt" and "SSR" into the string `"sandbox"`.
 *
 * `mockSiigoProducts` is imported on purpose: `src/mocks/` is seed state for
 * production code here, not test-only fixtures.
 */

export const MAPPING_KEY = "fact_vet.catalogMapping";
export const CREDENTIALS_KEY = "fact_vet.credentialsConfig";
export const SIIGO_PRODUCTS_KEY = "fact_vet.siigoProducts";
export const SIIGO_PAYMENT_TYPES_KEY = "fact_vet.siigoPaymentTypes";
export const SIIGO_DOCUMENT_TYPES_KEY = "fact_vet.siigoDocumentTypes";
export const SIIGO_SELLERS_KEY = "fact_vet.siigoSellers";
export const FALLBACK_ITEM_CODE_KEY = "fact_vet.fallbackItemCode";

export const DEFAULT_MAPPING: CatalogMapping = {
  items: [],
  payments: [],
  version: 0,
  updatedAt: "1970-01-01T00:00:00.000Z",
  documentTypeId: null,
  creditNoteDocumentTypeId: null,
  sellerId: null,
};

export function readFallbackItemCode(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(FALLBACK_ITEM_CODE_KEY);
    return raw && raw.trim().length > 0 ? raw.trim() : undefined;
  } catch { return undefined; }
}

export function readProducts(): SiigoProduct[] {
  if (typeof window === "undefined") return mockSiigoProducts;
  try {
    const raw = localStorage.getItem(SIIGO_PRODUCTS_KEY);
    if (raw) return JSON.parse(raw) as SiigoProduct[];
  } catch { /* missing/corrupt -> mocks */ }
  return mockSiigoProducts;
}

/**
 * H-6 — the Siigo payment-type catalog (carries the `due_date` flag used to
 * block emission for a payment type this integration can't supply a due date
 * for). Unlike `readProducts`, an empty/missing cache falls back to `[]`, not
 * a mock fixture: the guard simply can't fire without it, which is exactly
 * today's pre-H-6 behavior — never MORE permissive than before, only as
 * permissive as before until the catalog has been synced at least once.
 */
export function readPaymentTypes(): SiigoPaymentType[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SIIGO_PAYMENT_TYPES_KEY);
    if (raw) return JSON.parse(raw) as SiigoPaymentType[];
  } catch { /* missing/corrupt -> [] */ }
  return [];
}

/**
 * Discriminated read of the locally cached emission mode.
 *
 * Replaces the old `readMode(): EnvironmentMode`, which answered `"sandbox"`
 * for SSR, an absent key, a corrupt blob AND a genuinely stored sandbox — four
 * situations the caller could not tell apart, three of which are defaults.
 */
export function readCachedMode(): CachedModeRead {
  if (typeof window === "undefined") return { source: "ssr" };
  try {
    return parseCachedMode(localStorage.getItem(CREDENTIALS_KEY));
  } catch {
    // localStorage itself threw (disabled/quota) — not a corrupt value.
    return { source: "absent" };
  }
}

/** Local-cache-only read — used as the initial synchronous value and as a fallback if the server fetch fails. */
export function readLocalMapping(): CatalogMapping {
  if (typeof window === "undefined") return DEFAULT_MAPPING;
  try {
    const raw = localStorage.getItem(MAPPING_KEY);
    if (raw) return parseCatalogMapping(raw);
  } catch { /* missing/corrupt -> empty */ }
  return DEFAULT_MAPPING;
}

/** Server is the source of truth for the mapping — shared across every device. Falls back to the local cache on failure. */
export async function fetchServerMapping(): Promise<CatalogMapping | null> {
  try {
    const { ok, data } = await apiRequest("/api/catalog-mapping");
    if (!ok) return null;
    return catalogMappingSchema.parse(data);
  } catch {
    return null;
  }
}

/**
 * Server is the source of truth for the emission mode (sandbox/production) — never contains secrets.
 * Returns null when the request failed; the caller must NOT read that as a confirmed sandbox.
 */
export async function fetchServerMode(): Promise<EnvironmentMode | null> {
  try {
    const { ok, data } = await apiRequest<{ mode?: unknown }>("/api/emission-mode");
    if (!ok) return null;
    return environmentModeSchema.parse(data?.mode);
  } catch {
    return null;
  }
}
