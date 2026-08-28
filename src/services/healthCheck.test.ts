import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  aggregateOverall,
  stateFromResponse,
  checkService,
  checkHealth,
  healthReportSchema,
} from "./healthCheck";

const fakeRes = (ok: boolean, status = 200): Response =>
  ({ ok, status, json: async () => ({}), text: async () => "" }) as Response;

const slowRes = (): Response =>
  new Response("{}", { status: 200 });

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

describe("aggregateOverall", () => {
  it("returns online when all states are online", () => {
    expect(aggregateOverall(["online", "online", "online"])).toBe("online");
  });
  it("returns offline if any state is offline", () => {
    expect(aggregateOverall(["online", "offline", "online"])).toBe("offline");
  });
  it("returns degraded if any degraded but none offline", () => {
    expect(aggregateOverall(["online", "degraded"])).toBe("degraded");
  });
  it("returns unknown when only unknown/online present", () => {
    expect(aggregateOverall(["online", "unknown"])).toBe("unknown");
  });
  it("offline wins over degraded and unknown", () => {
    expect(aggregateOverall(["degraded", "unknown", "offline"])).toBe("offline");
  });
});

describe("stateFromResponse", () => {
  it("online when ok and fast", () => {
    expect(stateFromResponse(true, 120)).toBe("online");
  });
  it("degraded when ok but slow", () => {
    expect(stateFromResponse(true, 2500)).toBe("degraded");
  });
  it("offline when not ok", () => {
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
    expect(fetchMock).toHaveBeenCalledWith(
      "https://provet.test",
      expect.objectContaining({ method: "GET" }),
    );
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
    const h = await checkService("siigo", "https://siigo.test", fetchMock);
    expect(h.state).toBe("offline");
  });
  it("returns degraded when response is slow", async () => {
    fetchMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 2100));
      return slowRes();
    });
    const h = await checkService("siigo", "https://siigo.test", fetchMock);
    expect(h.state).toBe("degraded");
  });
});

describe("checkHealth", () => {
  beforeEach(() => {
    process.env.PROVET_BASE_URL = "https://provet.test";
    process.env.SIIGO_API_BASE_URL = "https://siigo.test";
  });

  it("returns an online report with 3 services including derived DIAN", async () => {
    fetchMock.mockResolvedValue(fakeRes(true));
    const report = await checkHealth();
    expect(report.overall).toBe("online");
    expect(report.services).toHaveLength(3);
    const names = report.services.map((s) => s.name);
    expect(names).toEqual(["provet", "siigo", "dian"]);
    const dian = report.services.find((s) => s.name === "dian");
    expect(dian?.state).toBe("online");
    expect(() => healthReportSchema.parse(report)).not.toThrow();
  });

  it("propagates Siigo offline to DIAN and overall", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("siigo") ? fakeRes(false, 503) : fakeRes(true),
    );
    const report = await checkHealth();
    expect(report.overall).toBe("offline");
    const dian = report.services.find((s) => s.name === "dian");
    expect(dian?.state).toBe("offline");
  });

  it("reports degraded overall when Siigo is slow", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("siigo")) {
        await new Promise((r) => setTimeout(r, 2100));
        return slowRes();
      }
      return fakeRes(true);
    });
    const report = await checkHealth();
    expect(report.overall).toBe("degraded");
  });
});

describe("healthReportSchema", () => {
  it("rejects an unknown service state", () => {
    const bad = {
      services: [{ name: "provet", label: "Provet Cloud", state: "bogus", latencyMs: 10, detail: "x", checkedAt: "t" }],
      overall: "online",
      checkedAt: "t",
    };
    expect(() => healthReportSchema.parse(bad)).toThrow();
  });
});
