"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Info, LogOut, Save } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { CatalogMapping } from "@/components/CatalogMapping";
import { PaymentMapping } from "@/components/PaymentMapping";
import {
  buildItemMappingRows,
  buildPaymentMappingRows,
  defaultItemMapping,
  defaultPaymentMapping,
  extractProvetItems,
  extractProvetPaymentMethods,
  parseCatalogMapping,
  reconcileMapping,
  serializeCatalogMapping,
  type CatalogMapping as CatalogMappingState,
} from "@/mappers/catalogMapping";
import { mockConsultations } from "@/mocks/provet";
import { mockSiigoPaymentTypes, mockSiigoProducts } from "@/mocks/siigo";
import type { SiigoProduct, SiigoPaymentType } from "@/schemas/siigo";

const STORAGE_KEY = "fact_vet.catalogMapping";

export default function MappingPage() {
  const provetItems = useMemo(() => extractProvetItems(mockConsultations), []);
  const provetMethods = useMemo(() => extractProvetPaymentMethods(mockConsultations), []);

  const [siigoProducts, setSiigoProducts] = useState<SiigoProduct[]>(mockSiigoProducts);
  const [siigoPaymentTypes, setSiigoPaymentTypes] = useState<SiigoPaymentType[]>(mockSiigoPaymentTypes);
  const [mapping, setMapping] = useState<CatalogMappingState>(() => ({ items: defaultItemMapping(provetItems, mockSiigoProducts), payments: defaultPaymentMapping(provetMethods, mockSiigoPaymentTypes), version: 0, updatedAt: new Date().toISOString() }));
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // SSR-safe load: reconcile persisted mapping against current catalogs.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = parseCatalogMapping(stored);
        setMapping(
          reconcileMapping(parsed, provetItems, mockSiigoProducts, provetMethods, mockSiigoPaymentTypes),
        );
      } catch {
        // corrupt blob → keep seeded defaults
      }
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemRows = useMemo(() => buildItemMappingRows(provetItems, siigoProducts, mapping.items), [provetItems, siigoProducts, mapping.items]);
  const paymentRows = useMemo(() => buildPaymentMappingRows(provetMethods, siigoPaymentTypes, mapping.payments), [provetMethods, siigoPaymentTypes, mapping.payments]);

  const handleItemSelect = useCallback((provetCode: string, siigoProductId: string | null) => {
    setMapping((prev) => ({
      ...prev,
      items: prev.items.map((m) =>
        m.provetCode === provetCode ? { ...m, siigoProductId } : m,
      ),
    }));
    setDirty(true);
  }, []);

  const handlePaymentSelect = useCallback((provetMethod: string, siigoPaymentTypeId: number | null) => {
    setMapping((prev) => ({
      ...prev,
      payments: prev.payments.map((m) =>
        m.provetMethod === provetMethod ? { ...m, siigoPaymentTypeId } : m,
      ),
    }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    const next: CatalogMappingState = { ...mapping, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, serializeCatalogMapping(next));
    setMapping(next);
    setDirty(false);
    setToast("Mapeo guardado");
    setTimeout(() => setToast(null), 2500);
  }, [mapping]);

  const handleSyncCatalogs = useCallback(async () => {
    setIsSyncing(true);
    try {
      const [ptRes, prodRes] = await Promise.all([fetch("/api/payment-types"), fetch("/api/products")]);
      const ptData: SiigoPaymentType[] = ptRes.ok ? await ptRes.json() : mockSiigoPaymentTypes;
      const prodData: SiigoProduct[] = prodRes.ok ? await prodRes.json() : mockSiigoProducts;
      setSiigoPaymentTypes(ptData);
      setSiigoProducts(prodData);
      const reconciled = reconcileMapping(mapping, provetItems, prodData, provetMethods, ptData);
      window.localStorage.setItem(STORAGE_KEY, serializeCatalogMapping(reconciled));
      setMapping(reconciled);
      setDirty(false);
      setToast("Catálogos sincronizados");
      setTimeout(() => setToast(null), 2500);
    } finally { setIsSyncing(false); }
  }, [mapping, provetItems, provetMethods]);

  return (
    <main className="flex h-screen w-screen flex-col gap-2 overflow-hidden bg-cool-grey p-2">
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-md border border-grid-line bg-pure-white px-2 py-1 text-xs font-semibold text-muted hover:bg-cool-grey"
            aria-label="Volver al panel"
          >
            <ArrowLeft className="h-3 w-3" /> Panel
          </Link>
          <h1 className="text-base font-semibold text-clinical-blue">Mapeo de Catálogo — Provet ↔ Siigo</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-xs">
            {loaded && !dirty ? (
              <span className="font-semibold text-status-accepted-text"><CheckCircle2 className="mr-1 inline h-3 w-3" />Guardado</span>
            ) : (
              <span className="font-semibold text-status-draft-text">Pendiente de guardar</span>
            )}
          </span>
          <span className="text-xs text-muted">Modo Sandbox</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty}
            className="inline-flex items-center gap-1 rounded-md bg-clinical-blue px-2 py-1 text-xs font-semibold text-white hover:bg-clinical-blue-hover active:bg-clinical-blue-active disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save className="h-3 w-3" /> Guardar
          </button>
          <form action={logoutAction}>
            <button type="submit" className="inline-flex items-center gap-1 rounded-md border border-grid-line px-2 py-1 text-xs font-semibold text-muted hover:bg-cool-grey">
              <LogOut className="h-3 w-3" /> Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <div className="flex items-start gap-2 rounded-md border border-grid-line bg-pure-white px-3 py-2 text-xs text-muted">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>Mappee los métodos de pago de Provet (<strong className="text-slate-text">Efectivo, Davivienda, Bancolombia</strong>) a sus tipos de pago activos en Siigo. Use 🔄 Sincronizar Catálogos para consultar Siigo en vivo y actualizar las opciones.</span>
      </div>
      <div className="scrollbar-thin flex h-[calc(100vh-100px)] flex-col gap-2 overflow-y-auto">
        <CatalogMapping rows={itemRows} siigoProducts={siigoProducts} onSelect={handleItemSelect} isRefreshing={isSyncing} onSync={handleSyncCatalogs} />
        <PaymentMapping rows={paymentRows} siigoPaymentTypes={siigoPaymentTypes} onSelect={handlePaymentSelect} />
      </div>
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md border border-status-accepted-border bg-status-accepted-bg px-3 py-2 text-sm font-semibold text-status-accepted-text">
          <CheckCircle2 className="h-4 w-4 shrink-0" />{toast}
        </div>
      )}
    </main>
  );
}
