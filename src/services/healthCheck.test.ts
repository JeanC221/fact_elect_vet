import { describe, it, expect, vi, afterEach } from "vitest";
import {
  aggregateOverall,
  stateFromResponse,
  checkService,
  checkSiigoHealth,
  checkHealth,
  healthReportSchema,
} from "./healthCheck";

vi.mock("./siigoAuth", () => {
  class MockSiigoAuthError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = "SiigoAuthError"; }
  }
  return { getSiigoAccessToken: vi.fn(), SiigoAuthError: MockSiigoAuthError };
});

const { getSiigoAccessToken, SiigoAuthError } = await import("./siigoAuth");

const fakeRes = (ok: boolean, status = 200): Response =>
  ({ ok, status, json: async () => ({}), text: async () => "" }) as Response;
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => {
  fetchMock.mockReset();
  vi.mocked(getSiigoAccessToken).mockReset();
});

describe("aggregateOverall", () => {
  it("ranks offline > degraded > unknown > online", () => {
    expect(aggregateOverall(["online", "online"])).toBe("online");
    expect(aggregateOverall(["online", "offline"])).toBe("offline");
    expect(aggregateOverall(["online", "degraded"])).toBe("degraded");
    expect(aggregateOverall(["online", "unknown"])).toBe("unknown");
    expect(aggregateOverall(["degraded", "unknown", "offline"])).toBe("offline");
  });
});

describe("stateFromResponse", () => {
  it("maps ok+fast→online, ok+slow→degraded, !ok→offline", () => {
    expect(stateFromResponse(true, 120)).toBe("online");
    expect(stateFromResponse(true, 2500)).toBe("degraded");
    expect(stateFromResponse(false, 100)).toBe("offline");
  });
});

describe("checkService", () => {
  it("returns online with latency on a successful fast response", async () => {
    fetchMock.mockResolvedValue(fakeRes(true));
    const h = await checkService("provet", "https://provet.test", fetchMock);
    expect(h.state).toBe("online");
    expect(h.latencyMs).toBeGreaterThanOrEqual(0);
    expect(h.label).toBe("Provet Cloud");
    expect(h.detail).toBe("Operativo");
    expect(fetchMock).toHaveBeenCalledWith("https://provet.test", expect.objectContaining({ method: "GET" }));
  });
  it("returns offline when fetch rejects (network failure)", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const h = await checkService("siigo", "https://siigo.test", fetchMock);
    expect(h.state).toBe("offline");
    expect(h.latencyMs).toBeNull();
    expect(h.detail).toBe("No disponible");
  });
  it("returns offline when response is not ok", async () => {
    fetchMock.mockResolvedValue(fakeRes(false, 503));
    expect((await checkService("siigo", "https://siigo.test", fetchMock)).state).toBe("offline");
  });
  it("returns degraded when response is slow", async () => {
    fetchMock.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 2100)); return new Response("{}", { status: 200 }); });
    const h = await checkService("siigo", "https://siigo.test", fetchMock);
    expect(h.state).toBe("degraded");
  });
  it("passes custom headers to the fetch call", async () => {
    fetchMock.mockResolvedValue(fakeRes(true));
    const headers = { "x-api-key": "secret-123" };
    expect((await checkService("provet", "https://provet.test", fetchMock, headers)).state).toBe("online");
    expect(fetchMock).toHaveBeenCalledWith("https://provet.test", expect.objectContaining({ headers }));
  });
});

describe("checkSiigoHealth", () => {
  it("returns online on successful token", async () => {
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: "tok", partnerId: "pid" });
    const h = await checkSiigoHealth();
    expect(h.state).toBe("online");
    expect(h.label).toBe("Siigo Nube");
    expect(h.detail).toBe("Operativo");
    expect(h.latencyMs).toBeGreaterThanOrEqual(0);
  });
  it("returns offline with SiigoAuthError message", async () => {
    vi.mocked(getSiigoAccessToken).mockRejectedValue(new SiigoAuthError("auth_failed", "Credenciales inválidas"));
    const h = await checkSiigoHealth();
    expect(h.state).toBe("offline");
    expect(h.detail).toBe("Credenciales inválidas");
  });
  it("returns offline with generic detail on non-auth error", async () => {
    vi.mocked(getSiigoAccessToken).mockRejectedValue(new Error("network error"));
    const h = await checkSiigoHealth();
    expect(h.state).toBe("offline");
    expect(h.detail).toBe("No disponible");
  });
});
describe("checkHealth", () => {
  const setup = () => {
    process.env.PROVET_BASE_URL = "https://provet.test";
    process.env.PROVET_API_KEY = "provet-key-001";
    fetchMock.mockResolvedValue(fakeRes(true));
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: "tok", partnerId: "pid" });
  };

  it("returns an online report with 3 services including derived DIAN", async () => {
    setup();
    const report = await checkHealth();
    expect(report.overall).toBe("online");
    expect(report.services).toHaveLength(3);
    expect(report.services.map((s) => s.name)).toEqual(["provet", "siigo", "dian"]);
    expect(report.services.find((s) => s.name === "dian")?.state).toBe("online");
    expect(() => healthReportSchema.parse(report)).not.toThrow();
  });
  it("passes x-api-key header to Provet ping", async () => {
    setup();
    await checkHealth();
    const provetCall = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes("provet")) as [string, RequestInit];
    expect(provetCall[1].headers).toEqual({ "x-api-key": "provet-key-001" });
  });
  it("propagates Siigo offline to DIAN and overall", async () => {
    fetchMock.mockResolvedValue(fakeRes(true));
    vi.mocked(getSiigoAccessToken).mockRejectedValue(new SiigoAuthError("auth_failed", "Credenciales inválidas"));
    const report = await checkHealth();
    expect(report.overall).toBe("offline");
    expect(report.services.find((s) => s.name === "dian")?.state).toBe("offline");
  });
  it("returns mock online report in sandbox", async () => {
    process.env.SIIGO_SANDBOX_MODE = "true";
    const report = await checkHealth();
    expect(report.overall).toBe("online");
    expect(report.services.every((s) => s.state === "online")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    delete process.env.SIIGO_SANDBOX_MODE;
  });
});

describe("healthReportSchema", () => {
  it("rejects an unknown service state", () => {
    expect(() => healthReportSchema.parse({
      services: [{ name: "provet", label: "Provet Cloud", state: "bogus", latencyMs: 10, detail: "x", checkedAt: "t" }],
      overall: "online", checkedAt: "t",
    })).toThrow();
  });
});
