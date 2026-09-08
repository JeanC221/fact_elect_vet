import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { POST } from "./route";

vi.mock("@/services/siigoAuth", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoAuth")>("@/services/siigoAuth");
  return { ...actual, getSiigoAccessToken: vi.fn() };
});

vi.mock("@/services/siigoCatalogs", () => ({
  fetchPaymentTypes: vi.fn(),
  fetchProducts: vi.fn(),
  fetchAllDocumentTypes: vi.fn(),
  fetchSellers: vi.fn(),
}));

import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { fetchPaymentTypes, fetchProducts, fetchAllDocumentTypes, fetchSellers } from "@/services/siigoCatalogs";
import { SiigoApiError } from "@/services/siigoApi";

import {
  TEST_JWT_SECRET,
  ADMIN_SESSION,
  issueSessionCookie,
  requestWithCookie,
} from "@/test/sessionRequest";

/**
 * D0 added a session guard to every route handler, so these tests now send a
 * genuinely signed cookie. An admin session is used because it satisfies both
 * `requireSession` and `requireAdmin`; the role boundary itself is covered by
 * `middleware.test.ts` and, for the emission-mode asymmetry, by the dedicated
 * employee cases in `src/app/api/emission-mode/route.test.ts`.
 */
let sessionCookie: string;
beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  sessionCookie = await issueSessionCookie(ADMIN_SESSION);
});

/** Authenticated request builder — same signature as the plain `new Request`. */
function authed(url: string, init: RequestInit = {}) {
  return requestWithCookie(url, sessionCookie, init);
}

const validCreds = {
  partnerId: "VETPARTNER01", username: "api-user@vet.com", accessKey: "secret-access-key",
  clientId: "client-id", clientSecret: "client-secret",
};

describe("POST /api/catalogs/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: "tok", partnerId: "VETPARTNER01" });
    vi.mocked(fetchAllDocumentTypes).mockResolvedValue([]);
    vi.mocked(fetchSellers).mockResolvedValue([]);
  });

  it("returns payment types + products + documentTypes + sellers on success", async () => {
    const pts = [{ id: 10948, name: "Efectivo", type: "cash" as const, active: true }];
    const prods = [{ id: "PROD-001", code: "SERV-CG-01", name: "Consulta", price: 50000, tax_classification: "IVA_19" as const, unit_of_measure: "UND" }];
    const docTypes = [{ id: 2372, code: "1", name: "Factura de venta", type: "FV", active: true }];
    const sellers = [{ id: 916, first_name: "Pruebas Api", last_name: "Api", active: true }];
    vi.mocked(fetchPaymentTypes).mockResolvedValue(pts);
    vi.mocked(fetchProducts).mockResolvedValue(prods);
    vi.mocked(fetchAllDocumentTypes).mockResolvedValue(docTypes);
    vi.mocked(fetchSellers).mockResolvedValue(sellers);
    const req = authed("http://localhost/api/catalogs/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validCreds),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.paymentTypes).toEqual(pts);
    expect(json.products).toEqual(prods);
    expect(json.documentTypes).toEqual(docTypes);
    expect(json.sellers).toEqual(sellers);
  });

  it("returns 502 on SiigoAuthError", async () => {
    vi.mocked(getSiigoAccessToken).mockRejectedValue(new SiigoAuthError("auth_failed", "Credenciales invalidas"));
    const req = authed("http://localhost/api/catalogs/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validCreds),
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it("returns 502 on SiigoApiError from catalog fetch", async () => {
    vi.mocked(fetchPaymentTypes).mockRejectedValue(new SiigoApiError("service_unavailable", "Network failure", 503));
    vi.mocked(fetchProducts).mockResolvedValue([]);
    const req = authed("http://localhost/api/catalogs/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validCreds),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it("falls back to server env vars when the body is empty (no browser-stored credentials)", async () => {
    vi.mocked(fetchPaymentTypes).mockResolvedValue([]);
    vi.mocked(fetchProducts).mockResolvedValue([]);
    const req = authed("http://localhost/api/catalogs/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(getSiigoAccessToken).toHaveBeenCalledWith(undefined);
  });

  it("falls back to server env vars when the request has no body at all", async () => {
    vi.mocked(fetchPaymentTypes).mockResolvedValue([]);
    vi.mocked(fetchProducts).mockResolvedValue([]);
    const req = authed("http://localhost/api/catalogs/sync", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(getSiigoAccessToken).toHaveBeenCalledWith(undefined);
  });

  it("returns 400 for Zod-invalid credentials", async () => {
    const bad = { ...validCreds, username: "" };
    const req = authed("http://localhost/api/catalogs/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bad),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  /**
   * The route's own response schema used to be `z.array(z.any())` — it looked
   * like validation and validated nothing. These two tests fail if it ever
   * reverts to that, and pin the status code: a malformed catalogue is Siigo's
   * problem (502), never the caller's (400).
   */
  it("returns 502 invalid_payload — not 400 — when a product from Siigo fails the real schema", async () => {
    vi.mocked(fetchPaymentTypes).mockResolvedValue([]);
    // `code` is required and non-empty; a bare object must not pass the route schema.
    vi.mocked(fetchProducts).mockResolvedValue([
      { id: "PROD-001", name: "Consulta" } as unknown as Awaited<ReturnType<typeof fetchProducts>>[number],
    ]);
    const req = authed("http://localhost/api/catalogs/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validCreds),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.error.code).toBe("invalid_payload");
  });

  it("returns 502 invalid_payload when a payment type from Siigo fails the real schema", async () => {
    vi.mocked(fetchProducts).mockResolvedValue([]);
    vi.mocked(fetchPaymentTypes).mockResolvedValue([
      { id: -1, name: "", type: "" } as unknown as Awaited<ReturnType<typeof fetchPaymentTypes>>[number],
    ]);
    const req = authed("http://localhost/api/catalogs/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validCreds),
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.error.code).toBe("invalid_payload");
  });
});