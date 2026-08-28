import { describe, expect, it } from "vitest";
import {
  buildInvoiceHistory, filterInvoiceHistory, invoiceHistoryEntrySchema,
  paginateHistory, toInvoiceHistoryEntry, type InvoiceHistoryEntry,
} from "./invoiceHistory";
import { buildConsultationQueue } from "@/mappers/consultationQueue";
import { mockClients, mockConsultations, mockPatients } from "@/mocks/provet";
import { mockSiigoInvoiceResponses } from "@/mocks/siigo";

const queueRows = buildConsultationQueue(mockConsultations, mockClients, mockPatients);
const mk = (i: number, c: string) => toInvoiceHistoryEntry(mockSiigoInvoiceResponses[i], c, new Date(`2026-08-1${i + 5}T09:00:00.000Z`));
const seedEntries: InvoiceHistoryEntry[] = [mk(0, "CON-001"), mk(1, "CON-002"), mk(2, "CON-003")];
const historyRows = buildInvoiceHistory(seedEntries, queueRows);

describe("toInvoiceHistoryEntry", () => {
  it("maps all response fields and preserves observations", () => {
    const e = toInvoiceHistoryEntry(mockSiigoInvoiceResponses[2], "CON-001", new Date("2026-08-15"));
    expect(e.invoiceId).toBe("INV-7753");
    expect(e.status).toBe("Rejected");
    expect(e.observations).toContain("invalid_identification");
    expect(e.consultationId).toBe("CON-001");
  });
});

describe("invoiceHistoryEntrySchema", () => {
  it("accepts a valid entry", () => {
    expect(invoiceHistoryEntrySchema.safeParse(mk(0, "CON-001")).success).toBe(true);
  });
  it("rejects an invalid status", () => {
    expect(invoiceHistoryEntrySchema.safeParse({ invoiceId: "X", cufe: "", status: "Bogus", consultationId: "C", emittedAt: new Date() }).success).toBe(false);
  });
  it("accepts the Annulled status", () => {
    expect(invoiceHistoryEntrySchema.safeParse({ invoiceId: "X", cufe: "C", status: "Annulled", consultationId: "C", emittedAt: new Date() }).success).toBe(true);
  });
});

describe("buildInvoiceHistory", () => {
  it("joins entries to consultation rows by consultationId", () => {
    expect(historyRows).toHaveLength(3);
    expect(historyRows[0].clientName).toBe("María García López");
    expect(historyRows[0].invoiceId).toBe("INV-7751");
  });
  it("falls back gracefully for unknown consultations", () => {
    const rows = buildInvoiceHistory([mk(0, "CON-NOPE")], queueRows);
    expect(rows[0].clientName).toBe("Cliente desconocido");
    expect(rows[0].clientDoc).toBe("—");
    expect(rows[0].total).toBe(0);
  });
});

describe("filterInvoiceHistory", () => {
  it("returns all rows when search empty and status All", () => {
    expect(filterInvoiceHistory(historyRows, { search: "", status: "All" })).toHaveLength(3);
  });
  it("filters by status", () => {
    const acc = filterInvoiceHistory(historyRows, { search: "", status: "Accepted" });
    expect(acc).toHaveLength(1);
    expect(acc[0].status).toBe("Accepted");
  });
  it("matches by client name case-insensitively", () => {
    const r = filterInvoiceHistory(historyRows, { search: "maría", status: "All" });
    expect(r).toHaveLength(1);
    expect(r[0].clientName).toBe("María García López");
  });
  it("matches by NIT / document", () => {
    const r = filterInvoiceHistory(historyRows, { search: "900123456", status: "All" });
    expect(r).toHaveLength(1);
    expect(r[0].clientDoc).toBe("NIT 900123456-1");
  });
  it("matches by invoice id", () => {
    const r = filterInvoiceHistory(historyRows, { search: "INV-7753", status: "All" });
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe("Rejected");
  });
  it("combines status + search", () => {
    const r = filterInvoiceHistory(historyRows, { search: "veterinaria", status: "Draft" });
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe("Draft");
  });
  it("returns empty for no match", () => {
    expect(filterInvoiceHistory(historyRows, { search: "zzz", status: "All" })).toHaveLength(0);
  });
});

describe("paginateHistory", () => {
  it("returns the visible slice and total", () => {
    const { slice, total } = paginateHistory(historyRows, 1, 2);
    expect(slice).toHaveLength(2);
    expect(total).toBe(3);
  });
  it("handles page overflow safely", () => {
    expect(paginateHistory(historyRows, 5, 2).slice).toHaveLength(0);
  });
});