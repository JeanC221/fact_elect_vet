import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * H-19 — `invoice_claims` had no dedicated test file in the whole project;
 * every guard was only exercised indirectly through route tests whose
 * `queryMock` decided its return value by call order or by matching on the
 * FUNCTION being tested, never by actually reading the WHERE clause in the
 * SQL sent. Manual mutation testing on C-10 confirmed the gap: deleting
 * `AND status = 'emitted'` from `acquireAnnulmentClaim` (or the analogous
 * `WHERE invoice_claims.status = 'annulled'` in `acquireInvoiceClaim`'s
 * conditional upsert) survived the full suite untouched.
 *
 * This file closes it two ways for every guarded query:
 *   1. A direct assertion on the literal SQL text sent to `queryMock`,
 *      so a deleted/reworded clause fails immediately and visibly.
 *   2. A fake pool whose behavior is DERIVED FROM the SQL string itself
 *      (regex over the real `SET status = 'x'` / `AND status = 'y'` /
 *      `status <> 'y'` fragments), not from which exported function is
 *      under test. If a guard clause is removed from the source query, the
 *      fake's regex stops matching it and the fake reproduces exactly what
 *      real Postgres would do without that clause — an unconditional
 *      write — so the behavioral assertions fail too, independent of (1).
 */

interface FakeRow {
  status: string;
  invoice_id: string | null;
  claimed_at: Date;
  last_error: string | null;
}

const { queryMock, claims, seed } = vi.hoisted(() => {
  const claims = new Map<string, FakeRow>();

  function seed(id: string, row: Partial<FakeRow> & { status: string }) {
    claims.set(id, {
      invoice_id: null,
      claimed_at: new Date("2026-09-01T12:00:00Z"),
      last_error: null,
      ...row,
    });
  }

  const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
    const id = String(params[0] ?? "");

    if (sql.includes("INSERT INTO invoice_claims")) {
      const current = claims.get(id);
      // Mirrors the real `ON CONFLICT (consultation_id) DO UPDATE ... WHERE
      // invoice_claims.status = 'annulled'`. If that WHERE fragment is ever
      // removed from the source, this regex stops matching and the fake
      // falls through to the unconditional-overwrite branch below — exactly
      // what real Postgres would do with an unconditional DO UPDATE.
      const conflictGuard = sql.match(/WHERE\s+invoice_claims\.status\s*=\s*'(\w+)'/);
      if (!current) {
        claims.set(id, { status: "pending", invoice_id: null, claimed_at: new Date(), last_error: null });
        return { rowCount: 1, rows: [{ consultation_id: id }] };
      }
      if (conflictGuard && current.status !== conflictGuard[1]) {
        return { rowCount: 0, rows: [] };
      }
      // No guard matched (mutant), or guard matched and current satisfies it.
      claims.set(id, { status: "pending", invoice_id: null, claimed_at: new Date(), last_error: null });
      return { rowCount: 1, rows: [{ consultation_id: id }] };
    }

    if (sql.startsWith("UPDATE invoice_claims")) {
      const current = claims.get(id);
      if (!current) return { rowCount: 0, rows: [] };
      // Same principle for every UPDATE guard: `AND status = 'x'`. Read it
      // from the real query text rather than from which function is calling.
      const guard = sql.match(/AND\s+status\s*=\s*'(\w+)'/);
      if (guard && current.status !== guard[1]) {
        return { rowCount: 0, rows: [] };
      }
      const setMatch = sql.match(/SET status = '(\w+)'/);
      const updated: FakeRow = { ...current };
      if (setMatch) updated.status = setMatch[1];
      if (sql.includes("invoice_id = $2")) updated.invoice_id = String(params[1] ?? "");
      if (sql.includes("last_error = $2")) updated.last_error = String(params[1] ?? "");
      if (sql.includes("last_error = NULL")) updated.last_error = null;
      claims.set(id, updated);
      return { rowCount: 1, rows: sql.includes("RETURNING") ? [{ consultation_id: id }] : [] };
    }

    if (sql.startsWith("DELETE FROM invoice_claims")) {
      const current = claims.get(id);
      if (!current) return { rowCount: 0, rows: [] };
      const neqGuard = sql.match(/AND\s+status\s*<>\s*'(\w+)'/);
      if (neqGuard && current.status === neqGuard[1]) {
        return { rowCount: 0, rows: [] };
      }
      claims.delete(id);
      return { rowCount: 1, rows: sql.includes("RETURNING") ? [{ consultation_id: id }] : [] };
    }

    if (sql.startsWith("SELECT consultation_id")) {
      if (sql.includes("WHERE consultation_id = $1")) {
        const current = claims.get(id);
        if (!current) return { rowCount: 0, rows: [] };
        return { rowCount: 1, rows: [{ consultation_id: id, ...current }] };
      }
      if (sql.includes("WHERE status <>")) {
        const neqGuard = sql.match(/status\s*<>\s*'(\w+)'/);
        const excluded = neqGuard ? neqGuard[1] : null;
        const rows = [...claims.entries()]
          .filter(([, row]) => row.status !== excluded)
          .sort((a, b) => a[1].claimed_at.getTime() - b[1].claimed_at.getTime())
          .map(([cid, row]) => ({ consultation_id: cid, ...row }));
        return { rowCount: rows.length, rows };
      }
    }

    throw new Error(`Unexpected SQL in test: ${sql}`);
  });

  return { queryMock, claims, seed };
});

vi.mock("@/services/db", () => ({ getPool: () => ({ query: queryMock }) }));

import {
  acquireInvoiceClaim,
  acquireAnnulmentClaim,
  releaseAnnulmentClaim,
  markClaimEmitted,
  markClaimUnknown,
  releaseInvoiceClaim,
  markClaimAnnulled,
  listOpenClaims,
  releaseClaimAsAdmin,
  getInvoiceClaim,
  claimConflictMessage,
  annulmentConflictMessage,
  ConsultationAlreadyClaimedError,
  AnnulmentNotAllowedError,
  type InvoiceClaim,
  type InvoiceClaimStatus,
} from "@/services/invoiceClaims";

const ID = "provet-consult-h19";

beforeEach(() => {
  claims.clear();
  queryMock.mockClear();
});

describe("acquireInvoiceClaim", () => {
  it("sends the conditional upsert with the annulled-only WHERE guard", async () => {
    await acquireInvoiceClaim(ID, "IDEM-1");
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (consultation_id) DO UPDATE");
    expect(sql).toContain("WHERE invoice_claims.status = 'annulled'");
  });

  it("succeeds on a fresh consultation with no prior claim", async () => {
    await expect(acquireInvoiceClaim(ID, "IDEM-1")).resolves.toBeUndefined();
    expect(claims.get(ID)?.status).toBe("pending");
  });

  it.each(["pending", "emitted", "unknown", "annulling"] as const)(
    "refuses to steal a claim currently '%s'",
    async (status) => {
      seed(ID, { status });
      await expect(acquireInvoiceClaim(ID, "IDEM-2")).rejects.toBeInstanceOf(ConsultationAlreadyClaimedError);
      // The losing device must not have overwritten the row it lost the race for.
      expect(claims.get(ID)?.status).toBe(status);
    },
  );

  it("re-claims a consultation whose previous invoice was annulled", async () => {
    seed(ID, { status: "annulled", invoice_id: "INV-OLD" });
    await expect(acquireInvoiceClaim(ID, "IDEM-3")).resolves.toBeUndefined();
    const row = claims.get(ID);
    expect(row?.status).toBe("pending");
    expect(row?.invoice_id).toBeNull();
  });

  it("carries the losing claim on ConsultationAlreadyClaimedError for the 409 message", async () => {
    seed(ID, { status: "emitted", invoice_id: "INV-1" });
    try {
      await acquireInvoiceClaim(ID, "IDEM-4");
      expect.unreachable("expected acquireInvoiceClaim to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ConsultationAlreadyClaimedError);
      const claimErr = err as ConsultationAlreadyClaimedError;
      expect(claimErr.consultationId).toBe(ID);
      expect(claimErr.claim?.status).toBe("emitted");
      expect(claimErr.claim?.invoiceId).toBe("INV-1");
    }
  });
});

describe("acquireAnnulmentClaim", () => {
  it("sends the UPDATE with the emitted-only WHERE guard", async () => {
    seed(ID, { status: "emitted", invoice_id: "INV-1" });
    await acquireAnnulmentClaim(ID);
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain("SET status = 'annulling'");
    expect(sql).toContain("AND status = 'emitted'");
  });

  it("transitions emitted -> annulling", async () => {
    seed(ID, { status: "emitted", invoice_id: "INV-1" });
    await expect(acquireAnnulmentClaim(ID)).resolves.toBeUndefined();
    expect(claims.get(ID)?.status).toBe("annulling");
  });

  it.each(["pending", "unknown", "annulling", "annulled"] as const)(
    "refuses to start an annulment when the claim is '%s'",
    async (status) => {
      seed(ID, { status });
      await expect(acquireAnnulmentClaim(ID)).rejects.toBeInstanceOf(AnnulmentNotAllowedError);
      expect(claims.get(ID)?.status).toBe(status);
    },
  );

  it("refuses when there is no claim at all", async () => {
    await expect(acquireAnnulmentClaim(ID)).rejects.toBeInstanceOf(AnnulmentNotAllowedError);
  });
});

describe("releaseAnnulmentClaim", () => {
  it("sends the UPDATE with the annulling-only WHERE guard", async () => {
    seed(ID, { status: "annulling" });
    await releaseAnnulmentClaim(ID);
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain("SET status = 'emitted'");
    expect(sql).toContain("AND status = 'annulling'");
  });

  it("reverts annulling -> emitted, leaving the existing invoice untouched", async () => {
    seed(ID, { status: "annulling", invoice_id: "INV-1" });
    await releaseAnnulmentClaim(ID);
    const row = claims.get(ID);
    expect(row?.status).toBe("emitted");
    expect(row?.invoice_id).toBe("INV-1");
  });

  it("is a no-op when the claim is not 'annulling'", async () => {
    seed(ID, { status: "pending" });
    await releaseAnnulmentClaim(ID);
    expect(claims.get(ID)?.status).toBe("pending");
  });
});

describe("markClaimEmitted", () => {
  it("pins the claim to the invoice regardless of prior status (no status guard by design)", async () => {
    seed(ID, { status: "pending" });
    await markClaimEmitted(ID, "INV-99");
    const row = claims.get(ID);
    expect(row?.status).toBe("emitted");
    expect(row?.invoice_id).toBe("INV-99");
    expect(row?.last_error).toBeNull();
  });
});

describe("markClaimUnknown", () => {
  it("moves the claim to unknown and truncates last_error to 500 chars", async () => {
    seed(ID, { status: "pending" });
    const longReason = "x".repeat(600);
    await markClaimUnknown(ID, longReason);
    const row = claims.get(ID);
    expect(row?.status).toBe("unknown");
    expect(row?.last_error).toHaveLength(500);
  });
});

describe("releaseInvoiceClaim", () => {
  it("deletes the row unconditionally by consultation_id", async () => {
    seed(ID, { status: "unknown" });
    await releaseInvoiceClaim(ID);
    expect(claims.has(ID)).toBe(false);
  });

  it("is a no-op when there is nothing to delete", async () => {
    await expect(releaseInvoiceClaim(ID)).resolves.toBeUndefined();
  });
});

describe("markClaimAnnulled", () => {
  it("sends the UPDATE with the annulling-only WHERE guard", async () => {
    seed(ID, { status: "annulling", invoice_id: "INV-1" });
    await markClaimAnnulled(ID, "NC-1");
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("SET status = 'annulled'");
    expect(sql).toContain("AND status = 'annulling'");
    expect(params).toEqual([ID, "NC-1"]);
  });

  it("transitions annulling -> annulled and stores the credit note id", async () => {
    seed(ID, { status: "annulling", invoice_id: "INV-1" });
    await markClaimAnnulled(ID, "NC-1");
    const row = claims.get(ID);
    expect(row?.status).toBe("annulled");
    expect(row?.invoice_id).toBe("NC-1");
  });

  it("is a no-op when the claim is not 'annulling'", async () => {
    seed(ID, { status: "emitted", invoice_id: "INV-1" });
    await markClaimAnnulled(ID, "NC-1");
    const row = claims.get(ID);
    expect(row?.status).toBe("emitted");
    expect(row?.invoice_id).toBe("INV-1");
  });
});

describe("listOpenClaims", () => {
  it("sends the emitted-exclusion WHERE guard", async () => {
    await listOpenClaims();
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain("WHERE status <> 'emitted'");
  });

  it("excludes 'emitted' claims and orders the rest oldest-first", async () => {
    seed("c-emitted", { status: "emitted", claimed_at: new Date("2026-09-01T00:00:00Z") });
    seed("c-newer-pending", { status: "pending", claimed_at: new Date("2026-09-03T00:00:00Z") });
    seed("c-older-unknown", { status: "unknown", claimed_at: new Date("2026-09-02T00:00:00Z") });

    const open = await listOpenClaims();

    expect(open.map((c) => c.consultationId)).toEqual(["c-older-unknown", "c-newer-pending"]);
  });
});

describe("releaseClaimAsAdmin", () => {
  it("sends the emitted-exclusion WHERE guard on the DELETE", async () => {
    seed(ID, { status: "pending" });
    await releaseClaimAsAdmin(ID);
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain("AND status <> 'emitted'");
  });

  it("releases a stuck 'pending' or 'unknown' claim", async () => {
    seed(ID, { status: "pending" });
    await expect(releaseClaimAsAdmin(ID)).resolves.toBe("released");
    expect(claims.has(ID)).toBe(false);
  });

  it("refuses to release an 'emitted' claim — the one state that must stay protected", async () => {
    seed(ID, { status: "emitted", invoice_id: "INV-1" });
    await expect(releaseClaimAsAdmin(ID)).resolves.toBe("refused_emitted");
    expect(claims.get(ID)?.status).toBe("emitted");
  });

  it("reports 'not_found' when there is no claim for that consultation", async () => {
    await expect(releaseClaimAsAdmin(ID)).resolves.toBe("not_found");
  });
});

describe("getInvoiceClaim", () => {
  it("returns null when no claim exists", async () => {
    await expect(getInvoiceClaim(ID)).resolves.toBeNull();
  });

  it("maps a stored row to InvoiceClaim", async () => {
    seed(ID, { status: "emitted", invoice_id: "INV-1" });
    const claim = await getInvoiceClaim(ID);
    expect(claim).toMatchObject({ consultationId: ID, status: "emitted", invoiceId: "INV-1" });
  });

  it("coerces a string claimed_at into a Date (raw pg driver edge case)", async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          consultation_id: ID,
          status: "pending",
          invoice_id: null,
          // Real pg driver hands back a Date for timestamptz; this simulates
          // the defensive string branch in `rowToClaim` that guards against it.
          claimed_at: "2026-09-05T10:00:00.000Z" as unknown as Date,
          last_error: null,
        },
      ],
    });
    const claim = await getInvoiceClaim(ID);
    expect(claim?.claimedAt).toBeInstanceOf(Date);
    expect(claim?.claimedAt.toISOString()).toBe("2026-09-05T10:00:00.000Z");
  });
});

describe("claimConflictMessage", () => {
  it("gives a generic message when there is no claim to explain", () => {
    expect(claimConflictMessage(null)).toMatch(/otro dispositivo/i);
  });

  const base: Omit<InvoiceClaim, "status"> = {
    consultationId: ID,
    invoiceId: null,
    claimedAt: new Date(),
    lastError: null,
  };

  it("names the invoice number when 'emitted' and known", () => {
    const msg = claimConflictMessage({ ...base, status: "emitted", invoiceId: "INV-42" });
    expect(msg).toContain("INV-42");
  });

  it("falls back to a generic 'emitted' message when the invoice id is unknown", () => {
    const msg = claimConflictMessage({ ...base, status: "emitted", invoiceId: null });
    expect(msg).not.toContain("INV");
    expect(msg).toMatch(/ya fue facturada/i);
  });

  it("tells staff to verify in Siigo for 'unknown'", () => {
    expect(claimConflictMessage({ ...base, status: "unknown" })).toMatch(/Siigo/);
  });

  it("says the consultation can be rebilled for 'annulled'", () => {
    expect(claimConflictMessage({ ...base, status: "annulled" })).toMatch(/anulada/i);
  });

  it("says another device is annulling for 'annulling'", () => {
    expect(claimConflictMessage({ ...base, status: "annulling" })).toMatch(/anulación.*curso/i);
  });

  it("gives the in-progress message for 'pending'", () => {
    expect(claimConflictMessage({ ...base, status: "pending" })).toMatch(/está emitiendo/i);
  });

  it("falls back to the pending message for an unrecognized status (corrupt row)", () => {
    const corrupt = { ...base, status: "not-a-real-status" as InvoiceClaimStatus };
    expect(claimConflictMessage(corrupt)).toBe(claimConflictMessage({ ...base, status: "pending" }));
  });
});

describe("annulmentConflictMessage", () => {
  it("says there is no invoice to annul when there is no claim", () => {
    expect(annulmentConflictMessage(null)).toMatch(/no tiene una factura emitida/i);
  });

  const base: Omit<InvoiceClaim, "status"> = {
    consultationId: ID,
    invoiceId: "INV-1",
    claimedAt: new Date(),
    lastError: null,
  };

  it("says another annulment is already in progress for 'annulling'", () => {
    expect(annulmentConflictMessage({ ...base, status: "annulling" })).toMatch(/ya hay una anulación/i);
  });

  it("says it was already annulled for 'annulled'", () => {
    expect(annulmentConflictMessage({ ...base, status: "annulled" })).toMatch(/ya fue anulada/i);
  });

  it("says to wait for the emission for 'pending'", () => {
    expect(annulmentConflictMessage({ ...base, status: "pending" })).toMatch(/emisión en curso/i);
  });

  it("points to the admin panel for 'unknown'", () => {
    expect(annulmentConflictMessage({ ...base, status: "unknown" })).toMatch(/Emisiones Bloqueadas/i);
  });

  it("gives the generic default message for 'emitted' (unreachable in practice)", () => {
    expect(annulmentConflictMessage({ ...base, status: "emitted" })).toMatch(/No se pudo iniciar/i);
  });

  it("falls back to the same default message for an unrecognized status (corrupt row)", () => {
    const corrupt = { ...base, status: "not-a-real-status" as InvoiceClaimStatus };
    expect(annulmentConflictMessage(corrupt)).toBe(annulmentConflictMessage({ ...base, status: "emitted" }));
  });
});
