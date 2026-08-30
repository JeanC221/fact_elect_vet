import { useEffect, useState } from "react";
import { parseCatalogMapping, type CatalogMapping } from "@/mappers/catalogMapping";
import { parseCredentialsConfig, type EnvironmentMode } from "@/mappers/credentials";
import { mockSiigoProducts } from "@/mocks/siigo";
import type { ProvetToSiigoOptions } from "@/mappers/provetToSiigo";

const MAPPING_KEY = "fact_vet.catalogMapping";
const CREDENTIALS_KEY = "fact_vet.credentialsConfig";

const DEFAULT_MAPPING: CatalogMapping = {
  items: [],
  payments: [],
  version: 0,
  updatedAt: "1970-01-01T00:00:00.000Z",
};

function readMode(): EnvironmentMode {
  if (typeof window === "undefined") return "sandbox";
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    if (raw) return parseCredentialsConfig(raw).mode;
  } catch { /* missing/corrupt -> sandbox */ }
  return "sandbox";
}

function readMapping(): CatalogMapping {
  if (typeof window === "undefined") return DEFAULT_MAPPING;
  try {
    const raw = localStorage.getItem(MAPPING_KEY);
    if (raw) return parseCatalogMapping(raw);
  } catch { /* missing/corrupt -> empty */ }
  return DEFAULT_MAPPING;
}

/**
 * Reactive emission options: reads localStorage synchronously on mount and
 * re-reads on the window `storage` event (fires when another tab/route writes
 * to localStorage), so the emission flow picks up mapping/credential changes
 * saved in Settings without a full page reload.
 */
export function useEmissionOptions(): ProvetToSiigoOptions {
  const [mode, setMode] = useState<EnvironmentMode>(readMode);
  const [mapping, setMapping] = useState<CatalogMapping>(readMapping);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MAPPING_KEY) setMapping(readMapping());
      if (e.key === CREDENTIALS_KEY) setMode(readMode());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { mapping, siigoProducts: mockSiigoProducts, mode };
}

