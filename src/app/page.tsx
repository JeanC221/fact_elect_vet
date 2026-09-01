"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { NavBar } from "@/components/NavBar";
import { ConsultationQueue } from "@/components/ConsultationQueue";
import { QuickEditDrawer } from "@/components/QuickEditDrawer";
import { InvoiceHistory } from "@/components/InvoiceHistory";
import { InvoiceSnapshotDrawer } from "@/components/InvoiceSnapshotDrawer";
import { CreditNoteModal } from "@/components/CreditNoteModal";
import {
  buildInvoicePayloadFromQuickEdit,
  buildPaymentOptions,
  buildQuickEditDetail,
  type InvoiceStatus,
  type QuickEditDetail,
  type QuickEditFormValues,
} from "@/mappers/consultationQueue";
import {
  buildInvoiceHistory,
  toInvoiceHistoryEntry,
  mapSiigoInvoiceStatus,
  serializeInvoiceHistory,
  parseInvoiceHistory,
  type InvoiceHistoryEntry,
  type InvoiceHistoryRow,
} from "@/mappers/invoiceHistory";
import { toCreditNotePayload, siigoCreditNoteSchema, type AnnulmentReason } from "@/mappers/creditNote";
import { generateIdempotencyKey, SiigoApiError, submitCreditNote } from "@/services/siigoApi";
import { siigoInvoiceResponseSchema } from "@/schemas/siigo";
import { translateSiigoError, retryWithBackoff, type TranslatedError, type QuickAction } from "@/services/errorTranslator";
import { ErrorBanner } from "@/components/ErrorBanner";
import { mockClients, mockConsultations, mockPatients } from "@/mocks/provet";
import { useEmissionOptions, readCreditNoteDocumentTypeId } from "@/hooks/useEmissionOptions";
import { useConsultationQueue } from "@/hooks/useConsultationQueue";

type Tab = "queue" | "history";

const TABS: { id: Tab; label: string }[] = [{ id: "queue", label: "Cola de Consultas" }, { id: "history", label: "Historial de Facturas" }];
const HISTORY_STORAGE_KEY = "fact_vet.invoiceHistory";

/** Reads the configured Siigo credit-note (NC) document type id, or undefined if not set — no hardcoded fallback (see MissingCreditNoteSettingError). */
//function readCreditNoteDocTypeId(): number | undefined {
//  try {
//    const raw = window.localStorage.getItem(CREDIT_NOTE_DOCUMENT_TYPE_ID_KEY);
//    const n = raw ? Number(raw) : NaN;
//    return Number.isInteger(n) && n > 0 ? n : undefined;
//  } catch { return undefined; }
//}

export default function HomePage() {
  const { rows, isInitialLoading, isRefreshing, fetchError: queueFetchError, clearFetchError, handleRefresh, setRowStatus } = useConsultationQueue();
  // Always starts empty so server-rendered markup and the client's first
  // render match exactly (localStorage doesn't exist during SSR) — hydrated
  // from localStorage in the useEffect below, after mount.
  const [history, setHistory] = useState<InvoiceHistoryEntry[]>([]);
  const [tab, setTab] = useState<Tab>("queue");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [translatedError, setTranslatedError] = useState<TranslatedError | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [annulTarget, setAnnulTarget] = useState<InvoiceHistoryRow | null>(null);
  const [snapshotTarget, setSnapshotTarget] = useState<InvoiceHistoryRow | null>(null);
  const [isAnnulling, setIsAnnulling] = useState(false);
  const [annulError, setAnnulError] = useState<string | null>(null);
  const [busyDownload, setBusyDownload] = useState<{ invoiceId: string; format: "pdf" | "xml" } | null>(null);
  const options = useEmissionOptions();

  useEffect(() => {
    const stored = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) return;
    try { setHistory(parseInvoiceHistory(stored)); }
    catch { /* corrupt blob → keep empty */ }
  }, []);

  const updateHistory = useCallback((updater: (prev: InvoiceHistoryEntry[]) => InvoiceHistoryEntry[]) => {
    setHistory((prev) => {
      const next = updater(prev);
      try { window.localStorage.setItem(HISTORY_STORAGE_KEY, serializeInvoiceHistory(next)); }
      catch { /* localStorage unavailable/full — history still updates in memory */ }
      return next;
    });
  }, []);

  const selectedDetail = useMemo(() => {
    if (!selectedId) return null;
    const detail = buildQuickEditDetail(mockConsultations, mockClients, mockPatients, selectedId, options.mapping);
    if (detail) return detail;
    const row = rows.find((r) => r.id === selectedId);
    if (!row) return null;
    const fallback: QuickEditDetail = {
      id: row.id,
      clientName: row.clientName,
      identificationType: row.identificationType,
      identificationNumber: row.identificationNumber,
      email: row.email,
      phone: row.phone,
      patientName: row.patientName,
      paymentMethod: "",
      paymentMethodOptions: buildPaymentOptions(options.mapping),
      total: row.total,
      items: row.items,
      createdAt: row.createdAt,
    };
    return fallback;
  }, [selectedId, rows, options.mapping]);

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); }, []);

  // Wrap the hook's refresh so a manual sync surfaces a success toast (fetch
  // logic, persistence & fallback live in useConsultationQueue).
  const handleRefreshConsultations = useCallback(async () => {
    const r = await handleRefresh();
    if (r.ok) showToast(`${r.count} consultas sincronizadas desde Provet`);
  }, [handleRefresh, showToast]);

  const disableActions = isInitialLoading || isRefreshing || isSubmitting;
  const displayError = translatedError ?? queueFetchError;
  const handleDismissError = useCallback(() => { setTranslatedError(null); clearFetchError(); }, [clearFetchError]);
  const invoicedConsultationIds = useMemo(
    () => new Set(history.map((e) => e.consultationId)),
    [history],
  );
  const pendingRows = useMemo(
    () => rows.filter((r) => !invoicedConsultationIds.has(r.id)),
    [rows, invoicedConsultationIds],
  );

  const handleDownload = useCallback(async (invoiceId: string, format: "pdf" | "xml") => {
    setBusyDownload({ invoiceId, format });
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/${format}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new SiigoApiError(data?.error?.code ?? "default", data?.error?.message ?? `Error al descargar el ${format.toUpperCase()}.`, res.status);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const readableName = history.find((e) => e.invoiceId === invoiceId)?.invoiceNumber ?? invoiceId;
      a.download = `factura-${readableName}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`${format.toUpperCase()} de la factura ${readableName} descargado con éxito.`);
    } catch (error) {
      showToast(translateSiigoError(error).message);
    } finally {
      setBusyDownload(null);
    }
  }, [showToast, history]);

  const handleAnnul = useCallback((invoiceId: string) => {
    const row = buildInvoiceHistory(history, rows).find((r) => r.invoiceId === invoiceId);
    if (!row || row.status !== "Accepted") { showToast("Solo se pueden anular facturas aceptadas por la DIAN."); return; }
    if (!row.cufe) { showToast("La factura no tiene CUFE; no se puede emitir nota crédito."); return; }
    setAnnulTarget(row); setAnnulError(null);
  }, [history, rows, showToast]);

  const handleAnnulConfirm = useCallback(async (reason: AnnulmentReason) => {
    if (!annulTarget) return;
    setIsAnnulling(true); setAnnulError(null);
    try {
      const d = buildQuickEditDetail(mockConsultations, mockClients, mockPatients, annulTarget.consultationId, options.mapping);
      if (!d) throw new Error("missing_source_data");
      const srcCon = mockConsultations.find((c) => c.id === annulTarget.consultationId);
      const original = buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, annulTarget.consultationId, { name: d.clientName, phone: d.phone, identificationType: d.identificationType, identificationNumber: d.identificationNumber, email: d.email, paymentMethod: srcCon?.payment_method ?? d.paymentMethodOptions[0]?.provetMethod ?? "", paidAmount: d.total }, options);
      if (!original) throw new Error("missing_source_data");
      const cn = toCreditNotePayload(original, { id: annulTarget.invoiceId, cufe: annulTarget.cufe }, reason, { documentTypeId: await readCreditNoteDocumentTypeId() });
      siigoCreditNoteSchema.parse(cn);
      const idemKey = generateIdempotencyKey();
      const response = await retryWithBackoff(() => submitCreditNote(cn, "", "", idemKey), { maxRetries: 5 });
      updateHistory((prev) => prev.map((e) => e.invoiceId === annulTarget.invoiceId ? { ...e, status: "Annulled" as InvoiceStatus, observations: `Anulada vía nota crédito ${response.id}` } : e).concat({ invoiceId: response.id, cufe: response.cufe, status: "Accepted" as InvoiceStatus, consultationId: annulTarget.consultationId, paymentMethod: annulTarget.paymentMethod, observations: `Nota crédito que anula ${annulTarget.invoiceId}`, emittedAt: new Date() }));
      setAnnulTarget(null);
      showToast(`Nota crédito ${response.id} generada · Factura ${annulTarget.invoiceId} anulada`);
    } catch (error) { setAnnulError(translateSiigoError(error).message); } finally { setIsAnnulling(false); }
  }, [annulTarget, showToast, updateHistory]);

  const handleSubmit = useCallback(async (values: QuickEditFormValues) => {
    if (!selectedId) return;
    setIsSubmitting(true); setTranslatedError(null); setRetryAttempt(0);
    try {
      const payload = buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, selectedId, values, options, selectedDetail ?? undefined);
      if (!payload) throw new Error("No se pudo construir el payload de factura.");
      const idemKey = generateIdempotencyKey();
      const response = await retryWithBackoff(async () => {
        const res = await fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Idempotency-Key": idemKey },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new SiigoApiError(data.error?.code ?? "default", data.error?.message ?? "Error al emitir la factura.");
        return siigoInvoiceResponseSchema.parse(data);
      }, { maxRetries: 5, onRetry: (n) => setRetryAttempt(n) });
      setRowStatus(selectedId, mapSiigoInvoiceStatus(response.status));
      updateHistory((prev) => [...prev, toInvoiceHistoryEntry(response, selectedId, new Date(), values.paymentMethod, values)]);
      const number = response.number ?? response.id;
      if (response.status === "Accepted") { setSelectedId(null); showToast(`Factura ${number} generada con éxito · CUFE: ${response.cufe}`); }
      else if (response.status === "Rejected") { setTranslatedError({ code: "rejected", message: "La DIAN rechazó la factura. Corrija los datos y reintente.", severity: "error", quickAction: "none", retryable: false }); }
      else {
        setSelectedId(null);
        showToast("Factura guardada como borrador en Siigo (pendiente de timbrar).");
      }
    } catch (error) {
      console.error("Invoice emission failed:", error);
      const te = translateSiigoError(error);
      setTranslatedError(te);
      if (te.quickAction === "save_draft") setRowStatus(selectedId, "Draft");
    } finally { setIsSubmitting(false); setRetryAttempt(0); }
  }, [selectedId, selectedDetail, options, setRowStatus, showToast, updateHistory]);

  const handleClose = useCallback(() => { if (!isSubmitting) { setSelectedId(null); setTranslatedError(null); setRetryAttempt(0); } }, [isSubmitting]);
  const handleQuickAction = useCallback((action: QuickAction) => { if (action.startsWith("edit_")) setTranslatedError(null); }, []);

  return (
    <main className="flex h-full w-full flex-col bg-cool-grey">
      <NavBar />
      <div className="flex flex-1 flex-col gap-2 p-2">
        <nav className="flex gap-1 px-1">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`rounded-md px-3 py-1 text-sm font-semibold ${tab === t.id ? "bg-clinical-blue text-white" : "border border-grid-line text-muted hover:bg-cool-grey"}`}>{t.label}</button>
          ))}
        </nav>
        <ErrorBanner error={displayError} retryAttempt={retryAttempt} maxRetries={5} onQuickAction={handleQuickAction} onDismiss={handleDismissError} />
        {tab === "queue" ? (
          <ConsultationQueue rows={pendingRows} isRefreshing={isRefreshing} isInitialLoading={isInitialLoading} disableActions={disableActions} onRefresh={handleRefreshConsultations} onInvoiceClick={(id) => setSelectedId(id)} />
        ) : (
          <InvoiceHistory entries={history} rows={rows} busyDownload={busyDownload} onDownload={handleDownload} onAnnul={handleAnnul} onViewSnapshot={setSnapshotTarget} />
        )}
        <QuickEditDrawer detail={selectedDetail} isSubmitting={isSubmitting} errorMessage={translatedError?.message ?? null} errorDetail={translatedError?.detail ?? null} fallbackItemCode={options.fallbackItemCode} documentTypeId={options.documentTypeId} sellerId={options.sellerId} onClose={handleClose} onSubmit={handleSubmit} />
        <CreditNoteModal row={annulTarget} isSubmitting={isAnnulling} errorMessage={annulError} onClose={() => { if (!isAnnulling) setAnnulTarget(null); }} onConfirm={handleAnnulConfirm} />
        <InvoiceSnapshotDrawer row={snapshotTarget} onClose={() => setSnapshotTarget(null)} />
        {toast && (
          <div className="fixed bottom-4 right-4 z-50 flex max-w-md items-center gap-2 rounded-md border border-status-accepted-border bg-status-accepted-bg px-3 py-2 text-sm font-semibold text-status-accepted-text">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="break-all">{toast}</span>
          </div>
        )}
      </div>
    </main>
  );
}