import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchConsultations,
  fetchClients,
  fetchPatients,
  fetchInvoices,
  fetchPhoneNumbers,
  fetchConsultationItems,
  fetchInvoiceRows,
  fetchInvoicesForConsultation,
  ProvetApiError,
} from "./provetApi";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  process.env.PROVET_BASE_URL = "https://api.provet.test";
});

afterEach(() => {
  delete process.env.PROVET_BASE_URL;
  fetchMock.mockReset();
});

const fakeRes = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null },
  }) as unknown as Response;

const page = (results: unknown[]) => ({ count: results.length, next: null, previous: null, results });

describe("fetchConsultations", () => {
  it("authenticates via Authorization: Bearer header and returns the most-recent page", async () => {
    fetchMock.mockResolvedValue(
      fakeRes(page([{ id: "C-1", client: "CL-1", patients: ["P-1"], status: "finished", created: "2026-08-20T10:00:00Z", modified: "2026-08-20T11:00:00Z" }])),
    );
    const rows = await fetchConsultations("tok");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("C-1");
    const url = fetchMock.mock.calls[0][0] as string;
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(url).toContain("/consultation?");
    expect(url).not.toContain("access_token=");
    expect(url).toContain("ordering=-modified");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok" });
  });

  it("filters by modified__gte using the configured sync window and page_size=1000", async () => {
    process.env.PROVET_SYNC_WINDOW_DAYS = "30";
    fetchMock.mockResolvedValue(fakeRes(page([])));
    await fetchConsultations("tok");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("page_size=1000");
    expect(url).toMatch(/modified__gte=\d{4}-\d{2}-\d{2}%20\d{2}%3A\d{2}%2B00%3A00/);
    delete process.env.PROVET_SYNC_WINDOW_DAYS;
  });

  it("follows next across pages until it is null, concatenating all results", async () => {
    fetchMock
      .mockResolvedValueOnce(
        fakeRes({ count: 2, next: "https://api.provet.test/consultation?page=2", previous: null, results: [
          { id: "C-1", client: "CL-1", patients: [], status: "finished", created: "2026-08-01T00:00:00Z", modified: "2026-08-01T00:00:00Z" },
        ] }),
      )
      .mockResolvedValueOnce(
        fakeRes(page([{ id: "C-2", client: "CL-2", patients: [], status: "finished", created: "2026-08-02T00:00:00Z", modified: "2026-08-02T00:00:00Z" }])),
      );
    const rows = await fetchConsultations("tok");
    expect(rows.map((r) => r.id)).toEqual(["C-1", "C-2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondCallUrl).toBe("https://api.provet.test/consultation?page=2");
  });

  it("stops after a safety cap instead of looping forever on a malformed next chain", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(fakeRes({ count: 1, next: url + "&x=1", previous: null, results: [
        { id: "C-1", client: "CL-1", patients: [], status: "finished", created: "2026-08-01T00:00:00Z", modified: "2026-08-01T00:00:00Z" },
      ] })),
    );
    const err = await fetchConsultations("tok").catch((e: unknown) => e);
    expect((err as ProvetApiError).code).toBe("too_many_pages");
  });

  it("maps a 401 to ProvetApiError auth_failed", async () => {
    fetchMock.mockResolvedValue(fakeRes({ detail: "Authentication credentials were not provided." }, 401));
    const err = await fetchConsultations("bad").catch((e: unknown) => e);
    expect((err as ProvetApiError).code).toBe("auth_failed");
  });

  it("maps a network failure to service_unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const err = await fetchClients("tok").catch((e: unknown) => e);
    expect((err as ProvetApiError).code).toBe("service_unavailable");
  });

  it("rejects a non-paginated response as parse_failed", async () => {
    fetchMock.mockResolvedValue(fakeRes({ not: "paginated" }));
    const err = await fetchConsultations("tok").catch((e: unknown) => e);
    expect((err as ProvetApiError).code).toBe("parse_failed");
  });

  it("throws missing_config instead of guessing a BASE URL when PROVET_BASE_URL is unset", async () => {
    delete process.env.PROVET_BASE_URL;
    const err = await fetchConsultations("tok").catch((e: unknown) => e);
    expect((err as ProvetApiError).code).toBe("missing_config");
    expect((err as ProvetApiError).message).toContain("PROVET_BASE_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries a 429 after the Retry-After delay and succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(fakeRes({}, 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(fakeRes(page([{ id: "C-1", client: "CL-1", patients: [], status: "finished", created: "2026-08-01T00:00:00Z", modified: "2026-08-01T00:00:00Z" }])));
    const rows = await fetchConsultations("tok");
    expect(rows).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to exponential backoff when Retry-After is absent on a 429", async () => {
    fetchMock
      .mockResolvedValueOnce(fakeRes({}, 429))
      .mockResolvedValueOnce(fakeRes(page([{ id: "C-1", client: "CL-1", patients: [], status: "finished", created: "2026-08-01T00:00:00Z", modified: "2026-08-01T00:00:00Z" }])));
    const rows = await fetchConsultations("tok");
    expect(rows).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated 429s with requests_limit instead of retrying forever", async () => {
    fetchMock.mockResolvedValue(fakeRes({}, 429, { "retry-after": "0" }));
    const err = await fetchConsultations("tok").catch((e: unknown) => e);
    expect((err as ProvetApiError).code).toBe("requests_limit");
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
  });
});

describe("the modified__gte window applies ONLY to consultations", () => {
  const url = () => fetchMock.mock.calls[0][0] as string;

  it("windows consultations — that is the resource the queue is scoped by", async () => {
    process.env.PROVET_SYNC_WINDOW_DAYS = "30";
    fetchMock.mockResolvedValue(fakeRes(page([])));
    await fetchConsultations("tok");
    expect(url()).toContain("modified__gte=");
  });

  /**
   * A consultation edited yesterday can have lines that were last touched
   * months ago. Windowing the CHILD resources by their own `modified` date
   * drops those lines, and the consultation then appears in the queue with
   * an incomplete item list — billed short, with nothing on screen to show
   * it. Measured against the live tenant: a 2000-day window returned 178 of
   * 223 invoicerows.
   */
  for (const [label, fn] of [
    ["invoicerow", fetchInvoiceRows],
    ["consultationitem", fetchConsultationItems],
    ["invoice", fetchInvoices],
    ["client", fetchClients],
    ["patient", fetchPatients],
    ["phonenumber", fetchPhoneNumbers],
  ] as const) {
    it(`never windows ${label} — a stale child would silently shrink an invoice`, async () => {
      process.env.PROVET_SYNC_WINDOW_DAYS = "30";
      fetchMock.mockResolvedValue(fakeRes(page([])));
      await fn("tok");
      expect(url()).not.toContain("modified__gte");
      expect(url()).toContain("page_size=1000");
    });
  }

  it("still orders and paginates the unwindowed resources", async () => {
    fetchMock.mockResolvedValue(fakeRes(page([])));
    await fetchInvoiceRows("tok");
    expect(url()).toContain("/invoicerow");
    expect(url()).toContain("page=1");
  });
});

describe("fetchInvoicesForConsultation — C-12", () => {
  it("sends consultation__is with the given id, unwindowed", async () => {
    fetchMock.mockResolvedValue(fakeRes(page([])));
    await fetchInvoicesForConsultation("38", "tok");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/invoice?");
    expect(url).toContain("consultation__is=38");
    expect(url).not.toContain("modified__gte");
  });

  it("URL-encodes the consultation id", async () => {
    fetchMock.mockResolvedValue(fakeRes(page([])));
    await fetchInvoicesForConsultation("has space", "tok");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("consultation__is=has%20space");
  });

  it("returns whatever Provet answers verbatim — callers filter defensively, this fetch does not assume the filter narrowed anything", async () => {
    fetchMock.mockResolvedValue(
      fakeRes(page([
        { id: "5", url: null, status: "3", total: 1699.04, total_vat: 0, total_with_vat: 1699.04, consultation: "https://api.provet.test/consultation/4/", credit_note: false },
        { id: "6", url: null, status: "3", total: 125.0, total_vat: 0, total_with_vat: 125.0, consultation: null, credit_note: true },
      ])),
    );
    const rows = await fetchInvoicesForConsultation("4", "tok");
    expect(rows).toHaveLength(2); // both come back — no client-side filtering happens in provetApi.ts
  });
});
