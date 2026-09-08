import { useCallback, useEffect, useState } from "react";
import type { CatalogMapping } from "@/mappers/catalogMapping";
import type { EnvironmentMode } from "@/mappers/credentials";
import { resolveEmissionGate, type CachedModeRead, type EmissionGate } from "@/mappers/emissionModeState";
import type { ProvetToSiigoOptions } from "@/mappers/provetToSiigo";
import type { SiigoProduct } from "@/schemas/siigo";
import {
  CREDENTIALS_KEY,
  FALLBACK_ITEM_CODE_KEY,
  MAPPING_KEY,
  SIIGO_PRODUCTS_KEY,
  fetchServerMapping,
  fetchServerMode,
  readCachedMode,
  readFallbackItemCode,
  readLocalMapping,
  readProducts,
} from "./emissionOptionsStorage";

// Re-exported: settings/mapping/page.tsx imports these storage keys from here.
export {
  SIIGO_PRODUCTS_KEY,
  SIIGO_PAYMENT_TYPES_KEY,
  SIIGO_DOCUMENT_TYPES_KEY,
  SIIGO_SELLERS_KEY,
  FALLBACK_ITEM_CODE_KEY,
} from "./emissionOptionsStorage";

/** ProvetToSiigoOptions plus the emission-mode gate for the multi-device race. */
export interface EmissionOptionsResult extends ProvetToSiigoOptions {
  /**
   * "I finished trying to load the mode" — true after the request settles,
   * successfully or not. Deliberately NOT a permission to emit: use `gate`.
   */
  isModeReady: boolean;
  /**
   * Whether emission may proceed, and why not when it may not. Resolved by the
   * pure `resolveEmissionGate`; `gate.modeConfirmed` is the flag that actually
   * means "the server told me the mode in this session".
   */
  gate: EmissionGate;
  /** Re-asks the server for the mode. There was no refresh path before this. */
  refreshMode: () => Promise<void>;
}

export function useEmissionOptions(): EmissionOptionsResult {
  const [serverMode, setServerMode] = useState<EnvironmentMode | null>(null);
  const [cachedMode, setCachedMode] = useState<CachedModeRead>(readCachedMode);
  const [isModeReady, setIsModeReady] = useState(false);
  const [mapping, setMapping] = useState<CatalogMapping>(readLocalMapping);
  const [siigoProducts, setSiigoProducts] = useState<SiigoProduct[]>(readProducts);
  const [fallbackItemCode, setFallbackItemCode] = useState<string | undefined>(readFallbackItemCode);

  const loadMode = useCallback(async () => {
    const next = await fetchServerMode();
    setServerMode(next);
    setIsModeReady(true);
  }, []);

  const refreshMode = useCallback(async () => {
    setIsModeReady(false);
    await loadMode();
  }, [loadMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [server, mode] = await Promise.all([fetchServerMapping(), fetchServerMode()]);
      if (cancelled) return;
      if (server) {
        setMapping(server);
        try { localStorage.setItem(MAPPING_KEY, JSON.stringify(server)); } catch { /* storage full/unavailable */ }
      }
      // `serverMode` stays null when the request failed. The gate reads that as
      // "unconfirmed" instead of silently trusting the sandbox default.
      setServerMode(mode);
      setIsModeReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MAPPING_KEY) setMapping(readLocalMapping());
      if (e.key === CREDENTIALS_KEY) {
        // Another tab rewrote the cached mode. That is an admin action, not a
        // server confirmation, so drop the confirmation and re-derive from cache
        // (which is exactly what the previous `setMode(readMode())` did).
        setCachedMode(readCachedMode());
        setServerMode(null);
      }
      if (e.key === SIIGO_PRODUCTS_KEY) setSiigoProducts(readProducts());
      if (e.key === FALLBACK_ITEM_CODE_KEY) setFallbackItemCode(readFallbackItemCode());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const gate = resolveEmissionGate({ settled: isModeReady, serverMode, cached: cachedMode });

  return {
    mapping,
    siigoProducts,
    mode: gate.mode,
    isModeReady,
    gate,
    refreshMode,
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
