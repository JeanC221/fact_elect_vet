import { describe, it, expect } from "vitest";
import {
  parseClaimsResponse,
  claimStatusPresentation,
  formatClaimAge,
  releaseConfirmationMessage,
  interpretReleaseResponse,
  extractErrorMessage,
} from "./invoiceClaimsAdmin";

const claim = {
  consultationId: "CON-4821",
  status: "unknown" as const,
  invoiceId: null,
  claimedAt: "2026-09-05T10:00:00.000Z",
  lastError: "Siigo timeout",
};

describe("parseClaimsResponse", () => {
  it("returns the claims array from a well-formed response", () => {
    const claims = parseClaimsResponse({ claims: [claim], count: 1 });
    expect(claims).toHaveLength(1);
    expect(claims?.[0].consultationId).toBe("CON-4821");
  });

  it("returns an EMPTY ARRAY for a valid response with no claims — nothing is blocked", () => {
    expect(parseClaimsResponse({ claims: [], count: 0 })).toEqual([]);
  });

  /**
   * The distinction below is the whole point of returning null instead of [].
   * "Nothing is blocked" and "I could not read the list" must never render the
   * same, or an admin will conclude a wedged consultation is fine.
   */
  it("returns NULL — not an empty array — when the response is unreadable", () => {
    expect(parseClaimsResponse({ error: { code: "default", message: "boom" } })).toBeNull();
    expect(parseClaimsResponse(null)).toBeNull();
    expect(parseClaimsResponse("[]")).toBeNull();
  });

  it("returns null when a claim carries a status the app does not model", () => {
    expect(parseClaimsResponse({ claims: [{ ...claim, status: "weird" }], count: 1 })).toBeNull();
  });

  it("accepts a claim carrying an invoiceId and no error", () => {
    const claims = parseClaimsResponse({
      claims: [{ ...claim, status: "pending", invoiceId: "INV-9", lastError: null }],
      count: 1,
    });
    expect(claims?.[0].invoiceId).toBe("INV-9");
  });
});

describe("claimStatusPresentation", () => {
  it("marks pending and unknown as releasable — those are the wedged states", () => {
    expect(claimStatusPresentation("pending").releasable).toBe(true);
    expect(claimStatusPresentation("unknown").releasable).toBe(true);
  });

  it("marks annulling as releasable too — same wedged-process reasoning as pending", () => {
    expect(claimStatusPresentation("annulling").releasable).toBe(true);
  });

  it("REFUSES to mark an emitted claim as releasable — that guard prevents a duplicate DIAN document", () => {
    expect(claimStatusPresentation("emitted").releasable).toBe(false);
    expect(claimStatusPresentation("emitted").hint).toMatch(/nota crédito/i);
  });

  it("does not offer release for an annulled claim either (the consultation is already billable)", () => {
    expect(claimStatusPresentation("annulled").releasable).toBe(false);
  });

  it("gives every modelled status a non-empty Spanish label", () => {
    for (const s of ["pending", "unknown", "annulling", "emitted", "annulled"] as const) {
      expect(claimStatusPresentation(s).label.length).toBeGreaterThan(0);
    }
  });
});

describe("formatClaimAge", () => {
  const now = new Date("2026-09-05T12:00:00.000Z");

  it.each([
    ["2026-09-05T11:59:40.000Z", "hace menos de un minuto"],
    ["2026-09-05T11:30:00.000Z", "hace 30 min"],
    ["2026-09-05T09:00:00.000Z", "hace 3 h"],
    ["2026-09-03T12:00:00.000Z", "hace 2 d"],
  ])("formats %s as %s", (claimedAt, expected) => {
    expect(formatClaimAge(claimedAt, now)).toBe(expected);
  });

  it("never renders a negative age when the server clock is ahead", () => {
    expect(formatClaimAge("2026-09-05T12:05:00.000Z", now)).toBe("hace un momento");
  });

  it("degrades to a readable string on an unparseable timestamp instead of NaN", () => {
    expect(formatClaimAge("not-a-date", now)).toBe("fecha desconocida");
  });
});

describe("releaseConfirmationMessage", () => {
  it("names the consultation and demands a check in Siigo Nube before releasing", () => {
    const msg = releaseConfirmationMessage("CON-4821");
    expect(msg).toContain("CON-4821");
    expect(msg).toMatch(/Siigo Nube/);
    expect(msg).toMatch(/segundo documento/i);
  });
});

describe("interpretReleaseResponse", () => {
  it("reports success on 200", () => {
    const out = interpretReleaseResponse(200, { released: true, consultationId: "CON-1" }, "CON-1");
    expect(out.kind).toBe("released");
    expect(out.message).toContain("CON-1");
  });

  it("surfaces the server's 409 claim_emitted message verbatim, without offering to force it", () => {
    const serverMessage =
      "Esta consulta ya tiene una factura emitida ante la DIAN. Desbloquearla permitiría emitir un documento duplicado.";
    const out = interpretReleaseResponse(409, { error: { code: "claim_emitted", message: serverMessage } }, "CON-1");
    expect(out.kind).toBe("blocked");
    expect(out.message).toBe(serverMessage);
  });

  it("still explains a 409 that arrives without a usable body", () => {
    const out = interpretReleaseResponse(409, null, "CON-1");
    expect(out.kind).toBe("blocked");
    expect(out.message).toMatch(/nota crédito/i);
  });

  it("treats 404 as already-resolved rather than as a failure", () => {
    const out = interpretReleaseResponse(404, { error: { code: "claim_not_found", message: "No hay bloqueo." } }, "CON-1");
    expect(out.kind).toBe("gone");
  });

  it("explains a 403 as a role problem, not a database error", () => {
    expect(interpretReleaseResponse(403, { error: { code: "forbidden", message: "x" } }, "CON-1").message)
      .toMatch(/administrador/i);
  });

  it("explains a 401 as an expired session", () => {
    expect(interpretReleaseResponse(401, null, "CON-1").message).toMatch(/sesión/i);
  });

  it("falls back to a generic error on 500, carrying the server message when there is one", () => {
    const out = interpretReleaseResponse(500, { error: { code: "default", message: "connection terminated" } }, "CON-1");
    expect(out.kind).toBe("error");
    expect(out.message).toBe("connection terminated");
  });

  it("never reports success for any non-200 status", () => {
    for (const status of [400, 401, 403, 404, 409, 500, 503]) {
      expect(interpretReleaseResponse(status, null, "CON-1").kind).not.toBe("released");
    }
  });
});

describe("extractErrorMessage", () => {
  it("pulls the Spanish message out of the project's standard error envelope", () => {
    expect(extractErrorMessage({ error: { code: "claim_emitted", message: "No se puede." } })).toBe("No se puede.");
  });

  it("returns null for a body that is not an error envelope", () => {
    expect(extractErrorMessage({ released: true })).toBeNull();
    expect(extractErrorMessage(undefined)).toBeNull();
  });
});
