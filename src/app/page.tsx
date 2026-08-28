"use client";

import { useCallback, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { NavBar } from "@/components/NavBar";
import { ConsultationQueue } from "@/components/ConsultationQueue";
import { QuickEditDrawer } from "@/components/QuickEditDrawer";
import { InvoiceHistory } from "@/components/InvoiceHistory";
import { CreditNoteModal } from "@/components/CreditNoteModal";
import {
  buildInvoicePayloadFromQuickEdit,
  buildQuickEditDetail,
  type InvoiceStatus,
  type QuickEditFormValues,
} from "@/mappers/consultationQueue";
import {
  buildInvoiceHistory,
  toInvoiceHistoryEntry,
  type InvoiceHistoryEntry,
  type InvoiceHistoryRow,
} from "@/mappers/invoiceHistory";
import { toCreditNotePayload, siigoCreditNoteSchema, type AnnulmentReason } from "@/mappers/creditNote";
import { fetchInvoicePdf, fetchInvoiceXml, generateIdempotencyKey, submitCreditNote, submitInvoice } from "@/services/siigoApi";
import { translateSiigoError, retryWithBackoff, type TranslatedError, type QuickAction } from "@/services/errorTranslator";
import { ErrorBanner } from "@/components/ErrorBanner";
import { mockClients, mockConsultations, mockPatients } from "@/mocks/provet";
import { mockSiigoInvoiceResponses } from "@/mocks/siigo";
import { useEmissionOptions } from "@/hooks/useEmissionOptions";
import { useConsultationQueue } from "@/hooks/useConsultationQueue";

type Tab = "queue" | "history";

const TABS: { id: Tab; label: string }[] = [{ id: "queue", label: "Cola de Consultas" }, { id: "history", label: "Historial de Facturas" }];

export default function HomePage() {
  const { rows, isInitialLoading, isRefreshing, fetchError: queueFetchError, clearFetchError, handleRefresh, setRowStatus } = useConsultationQueue();
  const [history, setHistory] = useState<InvoiceHistoryEntry[]>(() => [toInvoiceHistoryEntry(mockSiigoInvoiceResponses[0], "CON-001", new Date("2026-08-15T09:30:00.000Z")), toInvoiceHistoryEntry(mockSiigoInvoiceResponses[1], "CON-002", new Date("2026-08-16T10:30:00.000Z")), toInvoiceHistoryEntry(mockSiigoInvoiceResponses[2], "CON-003", new Date("2026-08-17T11:45:00.000Z"))]);
  const [tab, setTab] = useState<Tab>("queue");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [translatedError, setTranslatedError] = useState<TranslatedError | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [annulTarget, setAnnulTarget] = useState<InvoiceHistoryRow | null>(null);
  const [isAnnulling, setIsAnnulling] = useState(false);
  const [annulError, setAnnulError] = useState<string | null>(null);
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null);
  const options = useEmissionOptions();

  const selectedDetail = useMemo(() => selectedId ? buildQuickEditDetail(mockConsultations, mockClients, mockPatients, selectedId) ?? null : null, [selectedId]);

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

  const handleDownload = useCallback(async (invoiceId: string, format: "pdf" | "xml") => {
    setBusyInvoiceId(invoiceId);
    try {
      const blob = await (format === "pdf" ? fetchInvoicePdf : fetchInvoiceXml)(invoiceId, "", "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoiceId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`${format.toUpperCase()} de ${invoiceId} descargado con éxito.`);
    } catch (error) {
      showToast(translateSiigoError(error).message);
    } finally {
      setBusyInvoiceId(null);
    }
  }, [showToast]);

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
      const d = buildQuickEditDetail(mockConsultations, mockClients, mockPatients, annulTarget.consultationId);
      if (!d) throw new Error("missing_source_data");
      const original = buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, annulTarget.consultationId, { identificationType: d.identificationType, identificationNumber: d.identificationNumber, email: d.email, address: d.address, paymentMethod: d.paymentMethod, paidAmount: d.total });
      if (!original) throw new Error("missing_source_data");
      const cn = toCreditNotePayload(original, { id: annulTarget.invoiceId, cufe: annulTarget.cufe }, reason);
      siigoCreditNoteSchema.parse(cn);
      const idemKey = generateIdempotencyKey();
      const response = await retryWithBackoff(() => submitCreditNote(cn, "", "", idemKey), { maxRetries: 5 });
      setHistory((prev) => prev.map((e) => e.invoiceId === annulTarget.invoiceId ? { ...e, status: "Annulled" as InvoiceStatus, observations: `Anulada vía nota crédito ${response.id}` } : e).concat({ invoiceId: response.id, cufe: response.cufe, status: "Accepted" as InvoiceStatus, consultationId: annulTarget.consultationId, observations: `Nota crédito que anula ${annulTarget.invoiceId}`, emittedAt: new Date() }));
      setAnnulTarget(null);
      showToast(`Nota crédito ${response.id} generada · Factura ${annulTarget.invoiceId} anulada`);
    } catch (error) { setAnnulError(translateSiigoError(error).message); } finally { setIsAnnulling(false); }
  }, [annulTarget, showToast]);

  const handleSubmit = useCallback(async (values: QuickEditFormValues) => {
    if (!selectedId) return;
    setIsSubmitting(true); setTranslatedError(null); setRetryAttempt(0);
    try {
      const payload = buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, selectedId, values, options);
      if (!payload) throw new Error("missing_source_data");
      const idemKey = generateIdempotencyKey();
      const response = await retryWithBackoff(() => submitInvoice(payload, "", "", idemKey), { maxRetries: 5, onRetry: (n) => setRetryAttempt(n) });
      setRowStatus(selectedId, response.status);
      setHistory((prev) => [...prev, toInvoiceHistoryEntry(response, selectedId, new Date())]);
      if (response.status === "Accepted") { setSelectedId(null); showToast(`Factura ${response.id} generada con éxito · CUFE: ${response.cufe}`); }
      else if (response.status === "Rejected") { setTranslatedError({ code: "rejected", message: "La DIAN rechazó la factura. Corrija los datos y reintente.", severity: "error", quickAction: "none", retryable: false }); }
      else { setTranslatedError({ code: "draft", message: "Factura guardada como borrador.", severity: "warning", quickAction: "save_draft", retryable: false }); }
    } catch (error) {
      const te = translateSiigoError(error);
      setTranslatedError(te);
      if (te.quickAction === "save_draft") setRowStatus(selectedId, "Draft");
    } finally { setIsSubmitting(false); setRetryAttempt(0); }
  }, [selectedId, setRowStatus, showToast]);

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
          <ConsultationQueue rows={rows} isRefreshing={isRefreshing} isInitialLoading={isInitialLoading} disableActions={disableActions} onRefresh={handleRefreshConsultations} onInvoiceClick={(id) => setSelectedId(id)} />
        ) : (
          <InvoiceHistory entries={history} rows={rows} busyInvoiceId={busyInvoiceId} onDownload={handleDownload} onAnnul={handleAnnul} />
        )}
        <QuickEditDrawer detail={selectedDetail} isSubmitting={isSubmitting} errorMessage={translatedError?.message ?? null} onClose={handleClose} onSubmit={handleSubmit} />
        <CreditNoteModal row={annulTarget} isSubmitting={isAnnulling} errorMessage={annulError} onClose={() => { if (!isAnnulling) setAnnulTarget(null); }} onConfirm={handleAnnulConfirm} />
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