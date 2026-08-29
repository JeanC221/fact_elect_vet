import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/services/siigoAuth", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoAuth")>("@/services/siigoAuth");
  return { ...actual, getSiigoAccessToken: vi.fn() };
});

vi.mock("@/services/siigoCatalogs", () => ({
  fetchPaymentTypes: vi.fn(),
  fetchProducts: vi.fn(),
}));

import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { fetchPaymentTypes, fetchProducts } from "@/services/siigoCatalogs";
import { SiigoApiError } from "@/services/siigoApi";

const validCreds = {
  partnerId: "VETPARTNER01", username: "api-user@vet.com", accessKey: "secret-access-key",
  clientId: "client-id", clientSecret: "client-secret",
};

describe("POST /api/catalogs/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: "tok", partnerId: "VETPARTNER01" });
  });

  it("returns payment types + products on success", async () => {
    const pts = [{ id: 10948, name: "Efectivo", type: "cash" as const }];
    const prods = [{ id: "PROD-001", code: "SERV-CG-01", name: "Consulta", price: 50000, tax_classification: "IVA_19" as const, unit_of_measure: "UND" }];
    vi.mocked(fetchPaymentTypes).mockResolvedValue(pts);
    vi.mocked(fetchProducts).mockResolvedValue(prods);
    const req = new Request("http://localhost/api/catalogs/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validCreds),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.paymentTypes).toEqual(pts);
    expect(json.products).toEqual(prods);
  });

  it("returns 502 on SiigoAuthError", async () => {
    vi.mocked(getSiigoAccessToken).mockRejectedValue(new SiigoAuthError("auth_failed", "Credenciales invalidas"));
    const req = new Request("http://localhost/api/catalogs/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validCreds),
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it("returns 502 on SiigoApiError from catalog fetch", async () => {
    vi.mocked(fetchPaymentTypes).mockRejectedValue(new SiigoApiError("service_unavailable", "Network failure", 503));
    vi.mocked(fetchProducts).mockResolvedValue([]);
    const req = new Request("http://localhost/api/catalogs/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validCreds),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it("returns 400 for Zod-invalid credentials", async () => {
    const bad = { ...validCreds, username: "" };
    const req = new Request("http://localhost/api/catalogs/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bad),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
