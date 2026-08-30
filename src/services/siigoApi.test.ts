import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SIIGO_API_BASE_URL,
  SiigoApiError,
  fetchInvoicePdf,
  fetchInvoiceXml,
  generateIdempotencyKey,
  submitCreditNote,
  submitInvoice,
} from "./siigoApi";
import { toCreditNotePayload } from "@/mappers/creditNote";
import { mockSiigoInvoicePayloads, mockSiigoInvoiceResponses } from "@/mocks/siigo";

const payload = mockSiigoInvoicePayloads[0];
const okBody = mockSiigoInvoiceResponses[0];

const fakeRes = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const callAt = (i: number): [string, RequestInit] =>
  fetchMock.mock.calls[i] as unknown as [string, RequestInit];
const headersAt = (i: number): Record<string, string> =>
  callAt(i)[1].headers as Record<string, string>;

describe("submitInvoice", () => {
  it("POSTs to /v1/invoices with mandatory headers and returns a parsed response", async () => {
    fetchMock.mockResolvedValue(fakeRes(okBody));
    const res = await submitInvoice(payload, "tok-123", "PARTNER1");
    const [url, init] = callAt(0);
    const headers = headersAt(0);
    expect(url).toBe(`${SIIGO_API_BASE_URL}/v1/invoices`);
    expect(init.method).toBe("POST");
    expect(headers["Partner-Id"]).toBe("PARTNER1");
    expect(headers.Authorization).toBe("Bearer tok-123");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Idempotency-Key"]).toMatch(/^[A-Za-z0-9]{1,30}$/);
    expect(JSON.parse(String(init.body)).customer.name).toEqual(
      payload.customer.name,
    );
    expect(res).toEqual(okBody);
  });

  it("generates a unique Idempotency-Key per request unless one is provided", async () => {
    fetchMock.mockResolvedValue(fakeRes(okBody));
    await submitInvoice(payload, "t", "PARTNER1");
    await submitInvoice(payload, "t", "PARTNER1");
    expect(headersAt(0)["Idempotency-Key"]).not.toBe(
      headersAt(1)["Idempotency-Key"],
    );
    await submitInvoice(payload, "t", "PARTNER1", "RETRY-KEY-99");
    expect(headersAt(2)["Idempotency-Key"]).toBe("RETRY-KEY-99");
  });

  it("never serializes a root `total` key, even if a rogue caller injects one", async () => {
    fetchMock.mockResolvedValue(fakeRes(okBody));
    const rogue = { ...payload, total: 999 } as unknown as typeof payload;
    await submitInvoice(rogue, "tok-123", "PARTNER1");
    const body = JSON.parse(String(callAt(0)[1].body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("total");
    expect(body.payments).toEqual(payload.payments);
  });

  it("throws SiigoApiError with the parsed Siigo error code on 4xx", async () => {
    fetchMock.mockResolvedValue(
      fakeRes({ code: "invalid_identification", message: "NIT inválido" }, 400),
    );
    const err = await submitInvoice(payload, "t", "PARTNER1").catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SiigoApiError);
    expect((err as SiigoApiError).code).toBe("invalid_identification");
    expect((err as SiigoApiError).status).toBe(400);
  });

  it("maps 429/503 without a Siigo error body to fallback codes", async () => {
    fetchMock.mockResolvedValueOnce(fakeRes({}, 429));
    await expect(submitInvoice(payload, "t", "PARTNER1")).rejects.toMatchObject(
      { code: "requests_limit", status: 429 },
    );
    fetchMock.mockResolvedValueOnce(fakeRes({}, 503));
    await expect(submitInvoice(payload, "t", "PARTNER1")).rejects.toMatchObject(
      { code: "service_unavailable", status: 503 },
    );
  });

  it("wraps network failures as service_unavailable (no unhandled rejections)", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(submitInvoice(payload, "t", "PARTNER1")).rejects.toMatchObject(
      { name: "SiigoApiError", code: "service_unavailable" },
    );
  });

  it("validates the payload with Zod before any network call", async () => {
    const bad = { ...payload, seller: -1 };
    await expect(submitInvoice(bad, "t", "PARTNER1")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asserts the outgoing payload structurally matches the official Siigo contract", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    fetchMock.mockResolvedValue(fakeRes(okBody));
    await submitInvoice(payload, "tok-123", "PARTNER1");
    const sent = JSON.parse(String(callAt(0)[1].body));
    expect(sent).toHaveProperty("document.id");
    expect(sent).toHaveProperty("date");
    expect(sent).toHaveProperty("customer");
    expect(sent).toHaveProperty("items");
    expect(sent).toHaveProperty("payments");
    expect(sent).toHaveProperty("seller");
    expect(sent).toHaveProperty("stamp");
    expect(sent).toHaveProperty("mail");
    expect(sent).not.toHaveProperty("total");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[Siigo] payload validated against official contract before POST /v1/invoices"),
    );
    spy.mockRestore();
  });

  it("throws when the success body fails response schema validation", async () => {
    fetchMock.mockResolvedValue(fakeRes({ id: "INV-1" }, 200));
    await expect(submitInvoice(payload, "t", "PARTNER1")).rejects.toThrow();
  });
});

describe("generateIdempotencyKey", () => {
  it("is alphanumeric, max 30 chars, and unique", () => {
    const keys = new Set(Array.from({ length: 50 }, generateIdempotencyKey));
    expect(keys.size).toBe(50);
    for (const k of keys) expect(k).toMatch(/^[A-Za-z0-9]{1,30}$/);
  });
});

describe("postToSiigo header validation (defense-in-depth)", () => {
  it("rejects a Partner-Id shorter than 3 chars before any network call", async () => {
    await expect(submitInvoice(payload, "t", "AB")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an Idempotency-Key longer than 30 chars before any network call", async () => {
    const longKey = "A".repeat(31);
    await expect(submitInvoice(payload, "t", "PARTNER1", longKey)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const cnPayload = toCreditNotePayload(
  payload,
  { id: "INV-7751", cufe: "CUFE-abc123" },
  "billing_error",
);
const cnOkBody = { id: "NC-101", cufe: "NCUFE-xyz789", status: "Accepted" };

describe("submitCreditNote", () => {
  it("POSTs to /v1/credit-notes with mandatory headers and returns a parsed response", async () => {
    fetchMock.mockResolvedValue(fakeRes(cnOkBody));
    const res = await submitCreditNote(cnPayload, "tok-9", "PARTNER1");
    const [url, init] = callAt(0);
    const headers = headersAt(0);
    expect(url).toBe(`${SIIGO_API_BASE_URL}/v1/credit-notes`);
    expect(init.method).toBe("POST");
    expect(headers["Partner-Id"]).toBe("PARTNER1");
    expect(headers.Authorization).toBe("Bearer tok-9");
    expect(headers["Idempotency-Key"]).toMatch(/^[A-Za-z0-9]{1,30}$/);
    expect(JSON.parse(String(init.body)).base_document.id).toBe("INV-7751");
    expect(res).toEqual(cnOkBody);
  });

  it("reuses a provided Idempotency-Key across retries (no duplicate credit notes)", async () => {
    fetchMock.mockResolvedValue(fakeRes(cnOkBody));
    await submitCreditNote(cnPayload, "t", "PARTNER1", "NC-RETRY-1");
    await submitCreditNote(cnPayload, "t", "PARTNER1", "NC-RETRY-1");
    expect(headersAt(0)["Idempotency-Key"]).toBe("NC-RETRY-1");
    expect(headersAt(1)["Idempotency-Key"]).toBe("NC-RETRY-1");
  });

  it("throws SiigoApiError with the parsed Siigo error code on 4xx", async () => {
    fetchMock.mockResolvedValue(
      fakeRes({ code: "invalid_total_payments", message: "Totales no coinciden" }, 400),
    );
    const err = await submitCreditNote(cnPayload, "t", "PARTNER1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SiigoApiError);
    expect((err as SiigoApiError).code).toBe("invalid_total_payments");
  });

  it("maps 429/503 without a Siigo error body to fallback codes", async () => {
    fetchMock.mockResolvedValueOnce(fakeRes({}, 429));
    await expect(submitCreditNote(cnPayload, "t", "PARTNER1")).rejects.toMatchObject({ code: "requests_limit" });
    fetchMock.mockResolvedValueOnce(fakeRes({}, 503));
    await expect(submitCreditNote(cnPayload, "t", "PARTNER1")).rejects.toMatchObject({ code: "service_unavailable" });
  });

  it("wraps network failures as service_unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(submitCreditNote(cnPayload, "t", "PARTNER1")).rejects.toMatchObject({ name: "SiigoApiError", code: "service_unavailable" });
  });

  it("validates the payload with Zod before any network call", async () => {
    const bad = { ...cnPayload, total: cnPayload.total + 1 };
    await expect(submitCreditNote(bad, "t", "PARTNER1")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when the success body fails response schema validation", async () => {
    fetchMock.mockResolvedValue(fakeRes({ id: "NC-1", cufe: "X", status: "Draft" }, 200));
    await expect(submitCreditNote(cnPayload, "t", "PARTNER1")).rejects.toThrow();
  });
});

const fileBody = (b64: string) => ({ id: "INV-7751", base64: b64 });
const fileRes = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone: () => fileRes(body, status),
    blob: async () => new Blob(["raw"], { type: "application/octet-stream" }),
  }) as Response;

describe("fetchInvoicePdf / fetchInvoiceXml", () => {
  it("GETs /v1/invoices/{id}/pdf with mandatory headers and decodes base64", async () => {
    fetchMock.mockResolvedValue(fileRes(fileBody(btoa("PDF-DATA"))));
    const blob = await fetchInvoicePdf("INV-7751", "tok-1", "PARTNER1");
    const [url, init] = callAt(0);
    const headers = headersAt(0);
    expect(url).toBe(`${SIIGO_API_BASE_URL}/v1/invoices/INV-7751/pdf`);
    expect(init.method).toBe("GET");
    expect(headers["Partner-Id"]).toBe("PARTNER1");
    expect(headers.Authorization).toBe("Bearer tok-1");
    expect(blob.type).toBe("application/pdf");
    expect(await blob.text()).toBe("PDF-DATA");
  });

  it("GETs /v1/invoices/{id}/xml and decodes base64 with the XML mime type", async () => {
    fetchMock.mockResolvedValue(fileRes(fileBody(btoa("<Invoice/>"))));
    const blob = await fetchInvoiceXml("INV-7751", "t", "PARTNER1");
    expect(callAt(0)[0]).toBe(`${SIIGO_API_BASE_URL}/v1/invoices/INV-7751/xml`);
    expect(blob.type).toBe("application/xml");
    expect(await blob.text()).toBe("<Invoice/>");
  });

  it("falls back to the raw binary body when the response is not the base64 shape", async () => {
    fetchMock.mockResolvedValue(fileRes({ unexpected: true }));
    const blob = await fetchInvoicePdf("INV-7751", "t", "PARTNER1");
    expect(await blob.text()).toBe("raw");
  });

  it("throws SiigoApiError with the parsed Siigo error code on 4xx", async () => {
    fetchMock.mockResolvedValue(
      fileRes({ code: "parameter_required", message: "id requerido" }, 400),
    );
    const err = await fetchInvoicePdf("INV-7751", "t", "PARTNER1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SiigoApiError);
    expect((err as SiigoApiError).code).toBe("parameter_required");
  });

  it("wraps network failures as service_unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchInvoiceXml("INV-7751", "t", "PARTNER1")).rejects.toMatchObject({ name: "SiigoApiError", code: "service_unavailable" });
  });
});
