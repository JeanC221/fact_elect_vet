import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchPaymentTypes, fetchProducts } from "./siigoCatalogs";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  process.env.SIIGO_API_BASE_URL = "https://api.siigo.com";
  fetchMock.mockReset();
});

afterEach(() => {
  delete process.env.SIIGO_API_BASE_URL;
});

const fakeRes = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const callAt = (i: number): [string, RequestInit] =>
  fetchMock.mock.calls[i] as unknown as [string, RequestInit];

describe("fetchPaymentTypes", () => {
  it("GETs /v1/payment-types?document_type=FV with Partner-Id + Authorization headers", async () => {
    fetchMock.mockResolvedValue(fakeRes([{ id: 10948, name: "Efectivo", type: "cash" }]));
    const result = await fetchPaymentTypes("tok-123", "PARTNER-01");
    expect(result).toEqual([{ id: 10948, name: "Efectivo", type: "cash" }]);
    const [url, init] = callAt(0);
    expect(url).toBe("https://api.siigo.com/v1/payment-types?document_type=FV");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["Partner-Id"]).toBe("PARTNER-01");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok-123");
  });

  it("throws SiigoApiError service_unavailable on network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchPaymentTypes("tok", "pid")).rejects.toMatchObject({ code: "service_unavailable" });
  });

  it("throws SiigoApiError on non-OK response", async () => {
    fetchMock.mockResolvedValue(fakeRes({ code: "unauthorized", message: "Token invalido" }, 401));
    await expect(fetchPaymentTypes("tok", "pid")).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("fetchProducts", () => {
  it("GETs /v1/products and returns Zod-validated products", async () => {
    fetchMock.mockResolvedValue(fakeRes([
      { id: "PROD-001", code: "SERV-CG-01", name: "Consulta General", price: 50000, tax_classification: "IVA_19" },
    ]));
    const result = await fetchProducts("tok-123", "PARTNER-01");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("PROD-001");
    expect(result[0].unit_of_measure).toBe("UND"); // default applied by Zod
    const [url] = callAt(0);
    expect(url).toBe("https://api.siigo.com/v1/products");
  });

  it("throws SiigoApiError on malformed product (Zod validation)", async () => {
    fetchMock.mockResolvedValue(fakeRes([{ id: "X", code: "Y", name: "Z", price: -1, tax_classification: "IVA_19" }]));
    await expect(fetchProducts("tok", "pid")).rejects.toThrow();
  });
});
