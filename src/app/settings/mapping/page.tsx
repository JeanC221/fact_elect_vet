"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, AlertTriangle, CheckCircle2, LogOut, Save } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { CatalogMapping } from "@/components/CatalogMapping";
import { PaymentMapping } from "@/components/PaymentMapping";
import {
  buildItemMappingRows,
  buildPaymentMappingRows,
  defaultItemMapping,
  defaultPaymentMapping,
  parseCatalogMapping,
  reconcileMapping,
  serializeCatalogMapping,
  catalogMappingSchema,
  type CatalogMapping as CatalogMappingState,
} from "@/mappers/catalogMapping";
import { mockSiigoPaymentTypes, mockSiigoProducts } from "@/mocks/siigo";
import { SIIGO_PRODUCTS_KEY, SIIGO_PAYMENT_TYPES_KEY, SIIGO_DOCUMENT_TYPES_KEY, SIIGO_SELLERS_KEY, FALLBACK_ITEM_CODE_KEY } from "@/hooks/useEmissionOptions";
import { EmissionSettings } from "@/components/EmissionSettings";
import type { SiigoPaymentType, SiigoProduct, SiigoDocumentTypeCatalogEntry, SiigoSeller } from "@/schemas/siigo";
import type { ConsultationQueueRow } from "@/mappers/consultationQueue";

const STORAGE_KEY = "fact_vet.catalogMapping";

const FIXED_PROVET_PAYMENT_METHODS = [
  "Efectivo",
  "Tarjeta Crédito",
  "Tarjeta Débito",
  "Transferencia",
  "Nequi/Daviplata",
];

export default function MappingPage() {
  const [provetItems, setProvetItems] = useState<{ code: string; name: string }[]>([]);
  const provetMethods = FIXED_PROVET_PAYMENT_METHODS;

  const [mapping, setMapping] = useState<CatalogMappingState>(() => ({ items: defaultItemMapping(provetItems, mockSiigoProducts), payments: defaultPaymentMapping(provetMethods, mockSiigoPaymentTypes), version: 0, updatedAt: new Date().toISOString(), documentTypeId: null, creditNoteDocumentTypeId: null, sellerId: null }));
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [siigoProducts, setSiigoProducts] = useState<SiigoProduct[]>(mockSiigoProducts);
  const [siigoPaymentTypes, setSiigoPaymentTypes] = useState<SiigoPaymentType[]>(mockSiigoPaymentTypes);
  const [siigoDocumentTypes, setSiigoDocumentTypes] = useState<SiigoDocumentTypeCatalogEntry[]>([]);
  const [siigoSellers, setSiigoSellers] = useState<SiigoSeller[]>([]);
  const [fallbackItemCode, setFallbackItemCode] = useState<string>("");
  const [readWarning, setReadWarning] = useState(false);

  useEffect(() => {
    let liveProducts = mockSiigoProducts;
    let livePaymentTypes = mockSiigoPaymentTypes;
    let liveDocumentTypes: SiigoDocumentTypeCatalogEntry[] = [];
    let liveSellers: SiigoSeller[] = [];
    try {
      const rawProducts = window.localStorage.getItem(SIIGO_PRODUCTS_KEY);
      if (rawProducts) liveProducts = JSON.parse(rawProducts) as SiigoProduct[];
    } catch { /* corrupt -> mocks */ }
    try {
      const rawPaymentTypes = window.localStorage.getItem(SIIGO_PAYMENT_TYPES_KEY);
      if (rawPaymentTypes) livePaymentTypes = JSON.parse(rawPaymentTypes) as SiigoPaymentType[];
    } catch { /* corrupt -> mocks */ }
    try {
      const rawDocTypes = window.localStorage.getItem(SIIGO_DOCUMENT_TYPES_KEY);
      if (rawDocTypes) liveDocumentTypes = JSON.parse(rawDocTypes) as SiigoDocumentTypeCatalogEntry[];
    } catch { /* corrupt -> empty, forces re-sync */ }
    try {
      const rawSellers = window.localStorage.getItem(SIIGO_SELLERS_KEY);
      if (rawSellers) liveSellers = JSON.parse(rawSellers) as SiigoSeller[];
    } catch { /* corrupt -> empty, forces re-sync */ }
    setSiigoProducts(liveProducts);
    setSiigoPaymentTypes(livePaymentTypes);
    setSiigoDocumentTypes(liveDocumentTypes);
    setSiigoSellers(liveSellers);
    setFallbackItemCode(window.localStorage.getItem(FALLBACK_ITEM_CODE_KEY) ?? "");

    // Server (Blob) is the source of truth for the mapping — shared across every
    // device/browser. localStorage is only a fast local cache for offline reads.
    (async () => {
      try {
        const res = await fetch("/api/catalog-mapping");
        if (res.status === 503) {
          // Storage read genuinely failed — do NOT treat this as "no mapping
          // saved yet". Fall through to the local cache below and warn; the
          // server's own version check on save still prevents a blind overwrite.
          setReadWarning(true);
        } else if (res.ok) {
          const serverMapping = catalogMappingSchema.parse(await res.json());
          setMapping((m) => ({ ...serverMapping, items: m.items.length ? m.items : serverMapping.items }));
          window.localStorage.setItem(STORAGE_KEY, serializeCatalogMapping(serverMapping));
          setLoaded(true);
          return;
        }
      } catch { /* network error → fall back to local cache below */ }
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = parseCatalogMapping(stored);
          setMapping((m) => ({ ...parsed, items: m.items.length ? m.items : parsed.items }));
        }
        catch { /* corrupt blob → keep seeded defaults */ }
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/consultations");
        const data = (await res.json()) as { rows?: ConsultationQueueRow[] };
        if (cancelled || !res.ok || !Array.isArray(data.rows)) return;
        const seen = new Set<string>();
        const items: { code: string; name: string }[] = [];
        for (const row of data.rows) for (const it of row.items) {
          if (!seen.has(it.code)) { seen.add(it.code); items.push({ code: it.code, name: it.name }); }
        }
        setProvetItems(items);
        let currentProducts = mockSiigoProducts;
        let currentPaymentTypes = mockSiigoPaymentTypes;
        let currentDocumentTypes: SiigoDocumentTypeCatalogEntry[] = [];
        let currentSellers: SiigoSeller[] = [];
        try {
          const rawProducts = window.localStorage.getItem(SIIGO_PRODUCTS_KEY);
          if (rawProducts) currentProducts = JSON.parse(rawProducts) as SiigoProduct[];
        } catch { /* corrupt -> mocks */ }
        try {
          const rawPaymentTypes = window.localStorage.getItem(SIIGO_PAYMENT_TYPES_KEY);
          if (rawPaymentTypes) currentPaymentTypes = JSON.parse(rawPaymentTypes) as SiigoPaymentType[];
        } catch { /* corrupt -> mocks */ }
        try {
          const rawDocTypes = window.localStorage.getItem(SIIGO_DOCUMENT_TYPES_KEY);
          if (rawDocTypes) currentDocumentTypes = JSON.parse(rawDocTypes) as SiigoDocumentTypeCatalogEntry[];
        } catch { /* corrupt -> empty */ }
        try {
          const rawSellers = window.localStorage.getItem(SIIGO_SELLERS_KEY);
          if (rawSellers) currentSellers = JSON.parse(rawSellers) as SiigoSeller[];
        } catch { /* corrupt -> empty */ }
        setSiigoProducts(currentProducts);
        setSiigoPaymentTypes(currentPaymentTypes);
        setSiigoDocumentTypes(currentDocumentTypes);
        setSiigoSellers(currentSellers);
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          try {
            const parsed = parseCatalogMapping(stored);
            setMapping((m) => reconcileMapping({ ...parsed, payments: m.payments }, items, currentProducts, provetMethods, currentPaymentTypes, currentDocumentTypes, currentSellers));
          } catch { /* corrupt blob → keep current */ }
        }
      } catch { /* network error → item list stays empty; user can still sync catalogs */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const itemRows = useMemo(() => buildItemMappingRows(provetItems, siigoProducts, mapping.items), [provetItems, siigoProducts, mapping.items]);
  const paymentRows = useMemo(() => buildPaymentMappingRows(provetMethods, siigoPaymentTypes, mapping.payments), [provetMethods, siigoPaymentTypes, mapping.payments]);

  const handleItemSelect = useCallback((provetCode: string, siigoProductId: string | null) => {
    setMapping((p) => ({ ...p, items: p.items.map((m) => m.provetCode === provetCode ? { ...m, siigoProductId } : m) }));
    setDirty(true);
  }, []);

  const handlePaymentSelect = useCallback((provetMethod: string, siigoPaymentTypeId: number | null) => {
    setMapping((p) => ({ ...p, payments: p.payments.map((m) => m.provetMethod === provetMethod ? { ...m, siigoPaymentTypeId } : m) }));
    setDirty(true);
  }, []);

  const handleFallbackItemCodeChange = useCallback((value: string) => {
    setFallbackItemCode(value);
    window.localStorage.setItem(FALLBACK_ITEM_CODE_KEY, value);
    window.dispatchEvent(new StorageEvent("storage", { key: FALLBACK_ITEM_CODE_KEY }));
  }, []);

  const handleSave = useCallback(async () => {
    const next: CatalogMappingState = { ...mapping, updatedAt: new Date().toISOString() };
    try {
      const res = await fetch("/api/catalog-mapping", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: serializeCatalogMapping(next),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string }; current?: CatalogMappingState } | null;
        // 409 = someone else saved a newer version while this device was editing.
        // Pull their version into local state so the edits can be re-applied and
        // retried, instead of leaving this device stuck retrying against a stale version forever.
        if (res.status === 409 && data?.current) {
          setMapping(data.current);
        }
        setToast(data?.error?.message ?? "Error al guardar el mapeo en el servidor");
        setTimeout(() => setToast(null), 4000);
        return;
      }
      const saved = (await res.json()) as CatalogMappingState;
      window.localStorage.setItem(STORAGE_KEY, serializeCatalogMapping(saved));
      setMapping(saved); setDirty(false); setToast("Mapeo guardado — visible para todos los dispositivos");
      setTimeout(() => setToast(null), 2500);
    } catch {
      setToast("Error de red al guardar el mapeo");
      setTimeout(() => setToast(null), 2500);
    }
  }, [mapping]);

  const handleSyncCatalogs = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/catalogs/sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as { paymentTypes?: SiigoPaymentType[]; products?: SiigoProduct[]; documentTypes?: SiigoDocumentTypeCatalogEntry[]; sellers?: SiigoSeller[]; error?: { message?: string } };
      if (!res.ok || !data.paymentTypes || !data.products || !data.documentTypes || !data.sellers) { setToast(data.error?.message ?? "Error al sincronizar"); setTimeout(() => setToast(null), 2500); return; }
      const next = reconcileMapping(mapping, provetItems, data.products, provetMethods, data.paymentTypes, data.documentTypes, data.sellers);
      setMapping(next);
      setDirty(true);
      setSiigoProducts(data.products);
      setSiigoPaymentTypes(data.paymentTypes);
      setSiigoDocumentTypes(data.documentTypes);
      setSiigoSellers(data.sellers);
      window.localStorage.setItem(STORAGE_KEY, serializeCatalogMapping(next));
      window.localStorage.setItem(SIIGO_PRODUCTS_KEY, JSON.stringify(data.products));
      window.localStorage.setItem(SIIGO_PAYMENT_TYPES_KEY, JSON.stringify(data.paymentTypes));
      window.localStorage.setItem(SIIGO_DOCUMENT_TYPES_KEY, JSON.stringify(data.documentTypes));
      window.localStorage.setItem(SIIGO_SELLERS_KEY, JSON.stringify(data.sellers));
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
      window.dispatchEvent(new StorageEvent("storage", { key: SIIGO_PRODUCTS_KEY }));
      window.dispatchEvent(new StorageEvent("storage", { key: SIIGO_PAYMENT_TYPES_KEY }));
      window.dispatchEvent(new StorageEvent("storage", { key: SIIGO_DOCUMENT_TYPES_KEY }));
      window.dispatchEvent(new StorageEvent("storage", { key: SIIGO_SELLERS_KEY }));
      setToast("Catalogos sincronizados en vivo");
      setTimeout(() => setToast(null), 2500);
    } catch { setToast("Error de red al sincronizar"); setTimeout(() => setToast(null), 2500); }
    finally { setIsSyncing(false); }
  }, [provetItems, provetMethods, mapping]);

  const handleDocumentTypeChange = useCallback((id: number | null) => {
    setMapping((p) => ({ ...p, documentTypeId: id }));
    setDirty(true);
  }, []);

  const handleCreditNoteDocumentTypeChange = useCallback((id: number | null) => {
    setMapping((p) => ({ ...p, creditNoteDocumentTypeId: id }));
    setDirty(true);
  }, []);

  const handleSellerChange = useCallback((id: number | null) => {
    setMapping((p) => ({ ...p, sellerId: id }));
    setDirty(true);
  }, []);

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
      <div className="scrollbar-thin flex h-[calc(100vh-64px)] flex-col gap-2 overflow-y-auto">
        {readWarning && (
          <div className="flex items-start gap-2 rounded-md border border-status-draft-border bg-status-draft-bg px-3 py-2 text-xs text-status-draft-text">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              No se pudo confirmar el mapeo más reciente en el servidor (almacenamiento no
              disponible). Se está mostrando la última copia guardada en este dispositivo — puede
              no incluir cambios hechos desde otro equipo. Al guardar, el servidor rechazará el
              cambio si detecta una versión más nueva.
            </span>
          </div>
        )}
        <div className="rounded-md border border-grid-line bg-pure-white p-3">
          <label className="block text-xs font-semibold text-slate-text">
            Código de ítem de respaldo (Siigo)
          </label>
          <p className="mb-2 text-[11px] text-muted">
            Se usa cuando una consulta llega sin ítems. Debe ser el código EXACTO de un producto/servicio ya creado en Siigo — de lo contrario Siigo rechaza la factura con <code>invalid_reference</code>.
          </p>
          <input
            type="text"
            value={fallbackItemCode}
            onChange={(e) => handleFallbackItemCodeChange(e.target.value)}
            placeholder="ej. CONS-GEN-01"
            className="w-full rounded-md border border-grid-line px-2 py-1 text-sm"
          />
        </div>
        <EmissionSettings
          documentTypes={siigoDocumentTypes}
          sellers={siigoSellers}
          documentTypeId={mapping.documentTypeId}
          creditNoteDocumentTypeId={mapping.creditNoteDocumentTypeId}
          sellerId={mapping.sellerId}
          onDocumentTypeChange={handleDocumentTypeChange}
          onCreditNoteDocumentTypeChange={handleCreditNoteDocumentTypeChange}
          onSellerChange={handleSellerChange}
        />
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