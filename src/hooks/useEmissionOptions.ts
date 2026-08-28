/**
 * Custom hook: reads Settings localStorage (catalogMapping + credentialsConfig)
 * and builds ProvetToSiigoOptions for the dashboard emission path.
 * SSR-safe: localStorage only accessed in useEffect (after mount).
 */
import { useState, useEffect } from "react";
import { parseCatalogMapping, type CatalogMapping } from "@/mappers/catalogMapping";
import { parseCredentialsConfig, type EnvironmentMode } from "@/mappers/credentials";
import { mockSiigoProducts } from "@/mocks/siigo";
import type { ProvetToSiigoOptions } from "@/mappers/provetToSiigo";

const DEFAULT_MAPPING: CatalogMapping = {
  items: [],
  payments: [],
  version: 0,
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export function useEmissionOptions(): ProvetToSiigoOptions {
  const [mode, setMode] = useState<EnvironmentMode>("sandbox");
  const [mapping, setMapping] = useState<CatalogMapping>(DEFAULT_MAPPING);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("fact_vet.credentialsConfig");
      if (raw) setMode(parseCredentialsConfig(raw).mode);
    } catch {
      // Corrupt/missing → keep sandbox default
    }
    try {
      const raw = localStorage.getItem("fact_vet.catalogMapping");
      if (raw) setMapping(parseCatalogMapping(raw));
    } catch {
      // Corrupt/missing → keep empty mapping
    }
  }, []);

  return { mapping, siigoProducts: mockSiigoProducts, mode };
}