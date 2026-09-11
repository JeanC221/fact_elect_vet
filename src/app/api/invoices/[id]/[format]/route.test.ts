import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { GET } from "./route";

vi.mock("@/services/siigoAuth", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoAuth")>("@/services/siigoAuth");
  return { ...actual, getSiigoAccessToken: vi.fn() };
});
vi.mock("@/services/siigoApi", async () => {
  const actual = await vi.importActual<typeof import("@/services/siigoApi")>("@/services/siigoApi");
  return { ...actual, fetchInvoicePdf: vi.fn(), fetchInvoiceXml: vi.fn() };
});

import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { fetchInvoicePdf, fetchInvoiceXml, SiigoApiError } from "@/services/siigoApi";

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

// Built per call, not once at module scope: the session cookie is issued in
// `beforeAll`, so a module-level request would carry an empty cookie.
// `params` is a Promise since Next 16 (async request APIs): the handler awaits
// `props.params`, so the test must hand it a real Promise, not a plain object.
const call = (id: string, format: string) =>
  GET(authed("http://localhost/api/invoices/x/pdf"), { params: Promise.resolve({ id, format }) });

describe("GET /api/invoices/[id]/[format] — route param validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSiigoAccessToken).mockResolvedValue({ accessToken: "tok-123", partnerId: "PARTNER-ID" });
    vi.mocked(fetchInvoicePdf).mockResolvedValue(new Blob(["PDF-DATA"], { type: "application/pdf" }));
    vi.mocked(fetchInvoiceXml).mockResolvedValue(new Blob(["<Invoice/>"], { type: "application/xml" }));
  });

  it("rejects an id containing a double quote (Content-Disposition header injection) with 400 and never reaches Siigo", async () => {
    const res = await call('abc"; filename="evil.exe', "pdf");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_invoice_id");
    expect(fetchInvoicePdf).not.toHaveBeenCalled();
    expect(getSiigoAccessToken).not.toHaveBeenCalled();
  });

  it("rejects an id containing CRLF (response-splitting) with 400 and never reaches Siigo", async () => {
    const res = await call("abc\r\nSet-Cookie: session=stolen", "pdf");
    expect(res.status).toBe(400);
    expect(fetchInvoicePdf).not.toHaveBeenCalled();
  });

  it("rejects an id containing a slash (path traversal into another Siigo resource) with 400", async () => {
    const res = await call("../../users", "pdf");
    expect(res.status).toBe(400);
    expect(fetchInvoicePdf).not.toHaveBeenCalled();
  });

  it("rejects an id containing a percent sign (encoded traversal) with 400", async () => {
    const res = await call("abc%2F..%2Fusers", "xml");
    expect(res.status).toBe(400);
    expect(fetchInvoiceXml).not.toHaveBeenCalled();
  });

  it("rejects an id containing a query separator (parameter injection into the Siigo URL) with 400", async () => {
    const res = await call("abc?document_type=NC", "pdf");
    expect(res.status).toBe(400);
    expect(fetchInvoicePdf).not.toHaveBeenCalled();
  });

  it("rejects an empty id with 400", async () => {
    const res = await call("", "pdf");
    expect(res.status).toBe(400);
    expect(fetchInvoicePdf).not.toHaveBeenCalled();
  });

  it("rejects an absurdly long id with 400", async () => {
    const res = await call("a".repeat(200), "pdf");
    expect(res.status).toBe(400);
    expect(fetchInvoicePdf).not.toHaveBeenCalled();
  });

  it("validates the id before the format, so a bad id never reaches Siigo even with a bad format", async () => {
    const res = await call('bad"id', "exe");
    expect(res.status).toBe(400);
    expect(fetchInvoicePdf).not.toHaveBeenCalled();
    expect(fetchInvoiceXml).not.toHaveBeenCalled();
  });

  it("still rejects an invalid format with 400 invalid_format", async () => {
    const res = await call("5bb7d6d6-9c74-4b5f-9d0e-7f9c1a2b3c4d", "exe");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_format");
  });

  it("accepts a Siigo GUID id and returns the PDF with a quoted, safe Content-Disposition", async () => {
    const id = "5bb7d6d6-9c74-4b5f-9d0e-7f9c1a2b3c4d";
    const res = await call(id, "pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="${id}.pdf"`);
    expect(fetchInvoicePdf).toHaveBeenCalledWith(id, "tok-123", "PARTNER-ID");
  });

  it("accepts an alphanumeric-with-hyphen id (non-GUID Siigo consecutives) and returns the XML", async () => {
    const res = await call("INV-7751", "xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/xml");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="INV-7751.xml"');
    expect(fetchInvoiceXml).toHaveBeenCalledWith("INV-7751", "tok-123", "PARTNER-ID");
  });

  it("propagates a Siigo auth failure as 502", async () => {
    vi.mocked(getSiigoAccessToken).mockRejectedValue(new SiigoAuthError("missing_credentials", "no env"));
    const res = await call("INV-7751", "pdf");
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("missing_credentials");
  });

  it("propagates a SiigoApiError status and code", async () => {
    vi.mocked(fetchInvoicePdf).mockRejectedValue(new SiigoApiError("not_found", "Factura no encontrada.", 404));
    const res = await call("INV-7751", "pdf");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });
});
