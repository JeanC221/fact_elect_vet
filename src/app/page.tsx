"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
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
  invoiceHistoryEntrySchema,
  type InvoiceHistoryEntry,
  type InvoiceHistoryRow,
} from "@/mappers/invoiceHistory";
import { toCreditNotePayload, siigoCreditNoteSchema, type AnnulmentReason } from "@/mappers/creditNote";
import { generateIdempotencyKey, SiigoApiError } from "@/services/siigoApi";
import { siigoInvoiceResponseSchema } from "@/schemas/siigo";
import { translateSiigoError, retryWithBackoff, type TranslatedError, type QuickAction } from "@/services/errorTranslator";
import { apiRequest } from "@/services/apiClient";
import { ErrorBanner } from "@/components/ErrorBanner";
import { mockClients, mockConsultations, mockPatients } from "@/mocks/provet";
import { useEmissionOptions, readCreditNoteDocumentTypeId } from "@/hooks/useEmissionOptions";
import { EMISSION_GATE_MESSAGES } from "@/mappers/emissionModeState";
import { useConsultationQueue } from "@/hooks/useConsultationQueue";

type Tab = "queue" | "history";

const TABS: { id: Tab; label: string }[] = [{ id: "queue", label: "Cola de Consultas" }, { id: "history", label: "Historial de Facturas" }];
const HISTORY_STORAGE_KEY = "fact_vet.invoiceHistory";

export default function HomePage() {
  const { rows, isInitialLoading, isRefreshing, fetchError: queueFetchError, clearFetchError, handleRefresh, setRowStatus } = useConsultationQueue();
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
  const [isRetryingMode, setIsRetryingMode] = useState(false);
  const options = useEmissionOptions();

  const fetchHistoryFromServer = useCallback(async (): Promise<InvoiceHistoryEntry[] | null> => {
    try {
      const { ok, data } = await apiRequest("/api/invoice-history", { cache: "no-store" });
      if (!ok) return null;
      return z.array(invoiceHistoryEntrySchema).parse(data);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const server = await fetchHistoryFromServer();
      if (cancelled) return;
      if (server) {
        setHistory(server);
        try { window.localStorage.setItem(HISTORY_STORAGE_KEY, serializeInvoiceHistory(server)); }
        catch { /* storage full/unavailable — server copy is already the state */ }
        return;
      }
      const stored = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!stored) return;
      try { setHistory(parseInvoiceHistory(stored)); }
      catch { /* corrupt blob → keep empty */ }
    })();
    return () => { cancelled = true; };
  }, [fetchHistoryFromServer]);

  const refreshHistoryIfIdle = useCallback(async () => {
    if (isSubmitting || isAnnulling) return;
    const server = await fetchHistoryFromServer();
    if (!server) return;
    setHistory(server);
    try { window.localStorage.setItem(HISTORY_STORAGE_KEY, serializeInvoiceHistory(server)); }
    catch { /* storage full/unavailable */ }
  }, [fetchHistoryFromServer, isSubmitting, isAnnulling]);

  useEffect(() => {
    const POLL_MS = 20_000;
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshHistoryIfIdle();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [refreshHistoryIfIdle]);

  useEffect(() => {
    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") void refreshHistoryIfIdle();
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [refreshHistoryIfIdle]);

  const updateHistory = useCallback((updater: (prev: InvoiceHistoryEntry[]) => InvoiceHistoryEntry[], changedEntries: InvoiceHistoryEntry[]) => {
    setHistory((prev) => {
      const next = updater(prev);
      try { window.localStorage.setItem(HISTORY_STORAGE_KEY, serializeInvoiceHistory(next)); }
      catch { /* localStorage unavailable/full — history still updates in memory */ }
      // Fire-and-forget: push only the changed entries; the server merges by
      // invoiceId. UI already reflects `next` optimistically.
      apiRequest("/api/invoice-history", {
        method: "PUT",
        body: { entries: z.array(invoiceHistoryEntrySchema).parse(changedEntries) },
      }).catch(() => { /* offline/network error — local state + cache still updated */ });
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
      totalMismatch: row.totalMismatch,
      fullyReversed: row.fullyReversed,
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
  // Invoice emission is gated on options.gate.canEmit, which requires the server
  // to have confirmed the mode in this session (or a cached `production`, whose
  // failure mode is a loud Siigo rejection rather than an unstamped invoice).
  // The gate is passed into QuickEditDrawer so the button is actually disabled.
  const handleRetryMode = useCallback(async () => {
    setIsRetryingMode(true);
    try { await options.refreshMode(); } finally { setIsRetryingMode(false); }
  }, [options]);
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
    // NOT gated on the emission mode. creditNote.ts sets `stamp: { send: true }`
    // unconditionally (DIAN Resolución 000042) and the Siigo base URL comes from
    // the server, so the client mode affects invoices only. Blocking here stopped
    // a legally required annulment for a reason that does not apply to it.
    setIsAnnulling(true); setAnnulError(null);
    try {
      // Same real-data-first, synthetic-fallback strategy as selectedDetail/handleSubmit:
      // try the real Provet-backed consultation first, and only fall back to a
      // synthetic reconstruction (from the queue row + the exact form values
      // confirmed by staff at emission time) when the consultation isn't in the
      // in-memory Provet cache. Never falls back to the unrelated `mockConsultations`
      // fixture, which never matches a real Provet id.
      const row = rows.find((r) => r.id === annulTarget.consultationId);
      const fallbackDetail: QuickEditDetail | undefined = row
        ? {
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
            totalMismatch: row.totalMismatch,
            fullyReversed: row.fullyReversed,
          }
        : annulTarget.formSnapshot
        ? {
            id: annulTarget.consultationId,
            clientName: annulTarget.formSnapshot.name,
            identificationType: annulTarget.formSnapshot.identificationType,
            identificationNumber: annulTarget.formSnapshot.identificationNumber,
            email: annulTarget.formSnapshot.email,
            phone: annulTarget.formSnapshot.phone,
            patientName: annulTarget.patientName,
            paymentMethod: "",
            paymentMethodOptions: buildPaymentOptions(options.mapping),
            total: annulTarget.total,
            items: [],
            createdAt: annulTarget.emittedAt,
            totalMismatch: null,
            fullyReversed: false,
          }
        : undefined;
      if (!fallbackDetail) throw new Error("missing_source_data");
      const formValues: QuickEditFormValues = annulTarget.formSnapshot ?? {
        name: fallbackDetail.clientName,
        identificationType: fallbackDetail.identificationType,
        identificationNumber: fallbackDetail.identificationNumber,
        email: fallbackDetail.email,
        phone: fallbackDetail.phone,
        paymentMethod: annulTarget.paymentMethod || fallbackDetail.paymentMethodOptions[0]?.provetMethod || "",
        paidAmount: fallbackDetail.total,
      };
      // enforceTotalMatch: false — see QuickEditPayloadOptions. The invoice is
      // already stamped at the DIAN; blocking its credit note over a Provet
      // total disagreement would leave the wrong document legally alive.
      const original = buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, annulTarget.consultationId, formValues, options, fallbackDetail, { enforceTotalMatch: false });
      if (!original) throw new Error("missing_source_data");
      const cn = toCreditNotePayload(original, { id: annulTarget.invoiceId }, reason, { documentTypeId: await readCreditNoteDocumentTypeId() });
      siigoCreditNoteSchema.parse(cn);
      const idemKey = generateIdempotencyKey();
      const response = await retryWithBackoff(async () => {
        const { ok, data } = await apiRequest<{ id: string; cufe: string; status: "Accepted"; observations?: string; error?: { code?: string; message?: string } }>("/api/credit-notes", {
          method: "POST",
          idempotencyKey: idemKey,
          body: { consultationId: annulTarget.consultationId, payload: cn },
        });
        if (!ok) throw new SiigoApiError(data?.error?.code ?? "default", data?.error?.message ?? "Error al generar la nota crédito.");
        // A 2xx with an unparseable/empty body is a server bug, not "no credit
        // note was created" — must fail loudly, never silently return undefined
        // as if the annulment succeeded.
        if (data === null) throw new Error("Respuesta 2xx de /api/credit-notes sin cuerpo JSON válido.");
        return data;
      }, { maxRetries: 5 });
      const creditNoteEntry: InvoiceHistoryEntry = { invoiceId: response.id, cufe: response.cufe, status: "Accepted" as InvoiceStatus, consultationId: annulTarget.consultationId, paymentMethod: annulTarget.paymentMethod, observations: `Nota crédito que anula ${annulTarget.invoiceId}`, emittedAt: new Date(), patientName: annulTarget.patientName, formSnapshot: annulTarget.formSnapshot };
      const annulledOriginal: InvoiceHistoryEntry = { ...(history.find((e) => e.invoiceId === annulTarget.invoiceId) as InvoiceHistoryEntry), status: "Annulled" as InvoiceStatus, observations: `Anulada vía nota crédito ${response.id}` };
      updateHistory(
        (prev) => prev.map((e) => e.invoiceId === annulTarget.invoiceId ? annulledOriginal : e).concat(creditNoteEntry),
        [annulledOriginal, creditNoteEntry],
      );
      setAnnulTarget(null);
      showToast(`Nota crédito ${response.id} generada · Factura ${annulTarget.invoiceId} anulada`);
    } catch (error) { setAnnulError(translateSiigoError(error).message); } finally { setIsAnnulling(false); }
  }, [annulTarget, showToast, updateHistory, history, rows, options]);

  const handleSubmit = useCallback(async (values: QuickEditFormValues) => {
    if (!selectedId) return;
    // Defense in depth: the drawer button is already disabled when !canEmit.
    if (!options.gate.canEmit) {
      setTranslatedError({ code: "mode_not_confirmed", message: EMISSION_GATE_MESSAGES[options.gate.reason] ?? "No se pudo confirmar el modo de emisión.", severity: "warning", quickAction: "none", retryable: true });
      return;
    }
    setIsSubmitting(true); setTranslatedError(null); setRetryAttempt(0);
    try {
      const payload = buildInvoicePayloadFromQuickEdit(mockConsultations, mockClients, mockPatients, selectedId, values, options, selectedDetail ?? undefined);
      if (!payload) throw new Error("No se pudo construir el payload de factura.");
      // C-11 / D. Provet's own header total for this consultation, sent so the
      // server can check it against the lines without a Provet round-trip.
      // Thrown rather than defaulted: a missing value would silently disable
      // the server-side half of the guard.
      const expectedTotal = selectedDetail?.total;
      if (expectedTotal === undefined) throw new Error("No se pudo determinar el total de Provet para esta consulta.");
      const idemKey = generateIdempotencyKey();
      const response = await retryWithBackoff(async () => {
        const { ok, data } = await apiRequest<{ error?: { code?: string; message?: string } }>("/api/invoices", {
          method: "POST",
          idempotencyKey: idemKey,
          body: { consultationId: selectedId, expectedTotal, payload },
        });
        if (!ok) throw new SiigoApiError(data?.error?.code ?? "default", data?.error?.message ?? "Error al emitir la factura.");
        // siigoInvoiceResponseSchema.parse(null) already throws loudly on an
        // unparseable 2xx body — same fail-loud outcome as the original
        // `res.json()` throwing, just via Zod instead of a raw SyntaxError.
        return siigoInvoiceResponseSchema.parse(data);
      }, { maxRetries: 5, onRetry: (n) => setRetryAttempt(n) });
      setRowStatus(selectedId, mapSiigoInvoiceStatus(response.status));
      const newEntry = toInvoiceHistoryEntry(response, selectedId, new Date(), values.paymentMethod, values, selectedDetail?.patientName);
      updateHistory((prev) => [...prev, newEntry], [newEntry]);
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
        <QuickEditDrawer detail={selectedDetail} isSubmitting={isSubmitting} errorMessage={translatedError?.message ?? null} errorDetail={translatedError?.detail ?? null} fallbackItemCode={options.fallbackItemCode} documentTypeId={options.documentTypeId} sellerId={options.sellerId} gate={options.gate} isRetryingMode={isRetryingMode} onRetryMode={handleRetryMode} onClose={handleClose} onSubmit={handleSubmit} />
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