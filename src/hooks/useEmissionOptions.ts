import { useEffect, useState } from "react";
import { parseCatalogMapping, catalogMappingSchema, type CatalogMapping } from "@/mappers/catalogMapping";
import { parseCredentialsConfig, environmentModeSchema, type EnvironmentMode } from "@/mappers/credentials";
import { mockSiigoProducts } from "@/mocks/siigo";
import type { ProvetToSiigoOptions } from "@/mappers/provetToSiigo";
import type { SiigoProduct } from "@/schemas/siigo";

const MAPPING_KEY = "fact_vet.catalogMapping";
const CREDENTIALS_KEY = "fact_vet.credentialsConfig";
export const SIIGO_PRODUCTS_KEY = "fact_vet.siigoProducts";
export const SIIGO_PAYMENT_TYPES_KEY = "fact_vet.siigoPaymentTypes";
export const SIIGO_DOCUMENT_TYPES_KEY = "fact_vet.siigoDocumentTypes";
export const SIIGO_SELLERS_KEY = "fact_vet.siigoSellers";
export const FALLBACK_ITEM_CODE_KEY = "fact_vet.fallbackItemCode";

function readFallbackItemCode(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(FALLBACK_ITEM_CODE_KEY);
    return raw && raw.trim().length > 0 ? raw.trim() : undefined;
  } catch { return undefined; }
}

function readProducts(): SiigoProduct[] {
  if (typeof window === "undefined") return mockSiigoProducts;
  try {
    const raw = localStorage.getItem(SIIGO_PRODUCTS_KEY);
    if (raw) return JSON.parse(raw) as SiigoProduct[];
  } catch { /* missing/corrupt -> mocks */ }
  return mockSiigoProducts;
}

const DEFAULT_MAPPING: CatalogMapping = {
  items: [],
  payments: [],
  version: 0,
  updatedAt: "1970-01-01T00:00:00.000Z",
  documentTypeId: null,
  creditNoteDocumentTypeId: null,
  sellerId: null,
};

function readMode(): EnvironmentMode {
  if (typeof window === "undefined") return "sandbox";
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    if (raw) return parseCredentialsConfig(raw).mode;
  } catch { /* missing/corrupt -> sandbox */ }
  return "sandbox";
}

/** Local-cache-only read — used as the initial synchronous value and as a fallback if the server fetch fails. */
function readLocalMapping(): CatalogMapping {
  if (typeof window === "undefined") return DEFAULT_MAPPING;
  try {
    const raw = localStorage.getItem(MAPPING_KEY);
    if (raw) return parseCatalogMapping(raw);
  } catch { /* missing/corrupt -> empty */ }
  return DEFAULT_MAPPING;
}

/** Server (Blob) is the source of truth for the mapping — shared across every device. Falls back to the local cache on network failure. */
async function fetchServerMapping(): Promise<CatalogMapping | null> {
  try {
    const res = await fetch("/api/catalog-mapping");
    if (!res.ok) return null;
    return catalogMappingSchema.parse(await res.json());
  } catch {
    return null;
  }
}

/** Server (Blob) is the source of truth for the emission mode (sandbox/production) — never contains secrets. Falls back to the local cache on network failure. */
async function fetchServerMode(): Promise<EnvironmentMode | null> {
  try {
    const res = await fetch("/api/emission-mode");
    if (!res.ok) return null;
    const raw = await res.json();
    return environmentModeSchema.parse(raw.mode);
  } catch {
    return null;
  }
}

export function useEmissionOptions(): ProvetToSiigoOptions {
  const [mode, setMode] = useState<EnvironmentMode>(readMode);
  const [mapping, setMapping] = useState<CatalogMapping>(readLocalMapping);
  const [siigoProducts, setSiigoProducts] = useState<SiigoProduct[]>(readProducts);
  const [fallbackItemCode, setFallbackItemCode] = useState<string | undefined>(readFallbackItemCode);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [server, serverMode] = await Promise.all([fetchServerMapping(), fetchServerMode()]);
      if (cancelled) return;
      if (server) {
        setMapping(server);
        try { localStorage.setItem(MAPPING_KEY, JSON.stringify(server)); } catch { /* storage full/unavailable */ }
      }
      if (serverMode) setMode(serverMode);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MAPPING_KEY) setMapping(readLocalMapping());
      if (e.key === CREDENTIALS_KEY) setMode(readMode());
      if (e.key === SIIGO_PRODUCTS_KEY) setSiigoProducts(readProducts());
      if (e.key === FALLBACK_ITEM_CODE_KEY) setFallbackItemCode(readFallbackItemCode());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return {
    mapping,
    siigoProducts,
    mode,
    fallbackItemCode,
    documentTypeId: mapping.documentTypeId ?? undefined,
    sellerId: mapping.sellerId ?? undefined,
  };
}

/** Active Siigo credit-note (NC) document type id — reads the server (shared) mapping first, falls back to the local cache. */
export async function readCreditNoteDocumentTypeId(): Promise<number | undefined> {
  const server = await fetchServerMapping();
  if (server) return server.creditNoteDocumentTypeId ?? undefined;
  return readLocalMapping().creditNoteDocumentTypeId ?? undefined;
}