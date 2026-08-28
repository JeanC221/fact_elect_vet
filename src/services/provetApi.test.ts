import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchConsultations, fetchClients, ProvetApiError } from "./provetApi";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  process.env.PROVET_BASE_URL = "https://api.provet.test";
});

afterEach(() => {
  delete process.env.PROVET_BASE_URL;
  fetchMock.mockReset();
});

const fakeRes = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const page = (results: unknown[]) => ({ count: results.length, next: null, previous: null, results });

describe("fetchConsultations", () => {
  it("authenticates via ?access_token= and returns the most-recent page", async () => {
    fetchMock.mockResolvedValue(
      fakeRes(page([{ id: "C-1", client: "CL-1", patients: ["P-1"], status: "finished", created: "2026-08-20T10:00:00Z", modified: "2026-08-20T11:00:00Z" }])),
    );
    const rows = await fetchConsultations("tok");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("C-1");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/consultation?");
    expect(url).toContain("access_token=tok");
    expect(url).toContain("ordering=-modified");
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
});
