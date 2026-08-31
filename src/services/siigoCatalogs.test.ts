import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchPaymentTypes, fetchProducts, fetchDocumentTypes, fetchAllDocumentTypes, fetchSellers } from "./siigoCatalogs";

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
    fetchMock.mockResolvedValue(fakeRes([{ id: 10948, name: "Efectivo", type: "cash", active: true }]));
    const result = await fetchPaymentTypes("tok-123", "PARTNER-01");
    expect(result).toEqual([{ id: 10948, name: "Efectivo", type: "cash", active: true }]);
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
  it("GETs /v1/products and returns Zod-validated products (unwraps paginated results)", async () => {
    fetchMock.mockResolvedValue(fakeRes({
      pagination: { page: 1, page_size: 25, total_results: 1 },
      results: [
        { id: "PROD-001", code: "SERV-CG-01", name: "Consulta General", price: 50000, tax_classification: "IVA_19" },
      ],
    }));
    const result = await fetchProducts("tok-123", "PARTNER-01");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("PROD-001");
    const [url] = callAt(0);
    expect(url).toBe("https://api.siigo.com/v1/products");
  });

  it("throws SiigoApiError on malformed product (Zod validation)", async () => {
    fetchMock.mockResolvedValue(fakeRes({
      pagination: { page: 1, page_size: 25, total_results: 1 },
      results: [{ id: "", code: "Y", name: "Z" }],
    }));
    await expect(fetchProducts("tok", "pid")).rejects.toThrow();
  });
});

describe("fetchDocumentTypes", () => {
  it("GETs /v1/document-types?type=FV (flat array — NOT paginated) and returns parsed entries", async () => {
    fetchMock.mockResolvedValue(fakeRes([
      { id: 2372, code: "1", name: "documento de ingreso", description: "Factura de venta", type: "FV", active: true },
      { id: 27860, code: "4", name: "Factura electrónica de venta", description: "Factura Servicio", type: "FV", active: true },
    ]));
    const result = await fetchDocumentTypes("tok-123", "PARTNER-01", "FV");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(2372);
    const [url] = callAt(0);
    expect(url).toBe("https://api.siigo.com/v1/document-types?type=FV");
  });

  it("GETs /v1/document-types?type=NC for credit notes", async () => {
    fetchMock.mockResolvedValue(fakeRes([
      { id: 2379, code: "3", name: "Nota Crédito pruebas", description: "Nota Crédito pruebas", type: "NC", active: true },
    ]));
    await fetchDocumentTypes("tok", "pid", "NC");
    const [url] = callAt(0);
    expect(url).toBe("https://api.siigo.com/v1/document-types?type=NC");
  });

  it("throws SiigoApiError parameter_required when Siigo rejects a missing type param", async () => {
    fetchMock.mockResolvedValue(fakeRes({ code: "parameter_required", message: "type is required" }, 400));
    await expect(fetchDocumentTypes("tok", "pid", "FV")).rejects.toMatchObject({ code: "parameter_required" });
  });
});

describe("fetchAllDocumentTypes", () => {
  it("combines FV + NC document types into a single array", async () => {
    fetchMock
      .mockResolvedValueOnce(fakeRes([{ id: 2372, code: "1", name: "FV uno", type: "FV", active: true }]))
      .mockResolvedValueOnce(fakeRes([{ id: 2379, code: "3", name: "NC uno", type: "NC", active: true }]));
    const result = await fetchAllDocumentTypes("tok", "pid");
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.type)).toEqual(expect.arrayContaining(["FV", "NC"]));
  });
});

describe("fetchSellers", () => {
  it("GETs /v1/users and returns Zod-validated sellers (unwraps paginated results)", async () => {
    fetchMock.mockResolvedValue(fakeRes({
      pagination: { page: 1, page_size: 25, total_results: 1 },
      results: [
        { id: 916, username: "sandbox@siigoapi.com", first_name: "Pruebas Api", last_name: "Api", email: "sandbox@siigoapi.com", active: true, identification: "901659428" },
      ],
    }));
    const result = await fetchSellers("tok-123", "PARTNER-01");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(916);
    const [url] = callAt(0);
    expect(url).toBe("https://api.siigo.com/v1/users");
  });

  it("throws SiigoApiError on malformed seller (Zod validation)", async () => {
    fetchMock.mockResolvedValue(fakeRes({
      pagination: { page: 1, page_size: 25, total_results: 1 },
      results: [{ id: 1, first_name: "", last_name: "X", active: true }],
    }));
    await expect(fetchSellers("tok", "pid")).rejects.toThrow();
  });
});