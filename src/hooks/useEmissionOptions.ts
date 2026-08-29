import { useState } from "react";
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

function readInitialMode(): EnvironmentMode {
  if (typeof window === "undefined") return "sandbox";
  try {
    const raw = localStorage.getItem("fact_vet.credentialsConfig");
    if (raw) return parseCredentialsConfig(raw).mode;
  } catch { /* missing/corrupt -> sandbox */ }
  return "sandbox";
}

function readInitialMapping(): CatalogMapping {
  if (typeof window === "undefined") return DEFAULT_MAPPING;
  try {
    const raw = localStorage.getItem("fact_vet.catalogMapping");
    if (raw) return parseCatalogMapping(raw);
  } catch { /* missing/corrupt -> empty */ }
  return DEFAULT_MAPPING;
}

export function useEmissionOptions(): ProvetToSiigoOptions {
  const [mode] = useState<EnvironmentMode>(readInitialMode);
  const [mapping] = useState<CatalogMapping>(readInitialMapping);

  return { mapping, siigoProducts: mockSiigoProducts, mode };
}
