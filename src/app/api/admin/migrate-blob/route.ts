import { NextResponse } from "next/server";
import { list, get, BlobNotFoundError } from "@vercel/blob";
import { Pool } from "pg";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const invoiceHistoryEntrySchema = z.object({
  invoiceId: z.string().trim().min(1),
  invoiceNumber: z.string().trim().min(1).optional(),
  cufe: z.string(),
  status: z.enum(["Accepted", "Draft", "Rejected", "Annulled"]),
  consultationId: z.string().trim().min(1),
  paymentMethod: z.string().default(""),
  observations: z.string().optional(),
  emittedAt: z.coerce.date(),
  formSnapshot: z.record(z.string(), z.unknown()).optional(),
});

const catalogMappingSchema = z.object({
  items: z.array(z.object({ provetCode: z.string(), siigoProductId: z.string().nullable() })),
  payments: z.array(z.object({ provetMethod: z.string(), siigoPaymentTypeId: z.number().nullable() })),
  version: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
  documentTypeId: z.number().int().positive().nullable().optional(),
  creditNoteDocumentTypeId: z.number().int().positive().nullable().optional(),
  sellerId: z.number().int().positive().nullable().optional(),
});

const credentialsConfigSchema = z.object({
  mode: z.enum(["sandbox", "production"]),
  configured: z.record(z.string(), z.boolean()),
  updatedAt: z.string().min(1),
});

const rateLimitStateSchema = z.object({
  attempts: z.array(z.number()),
  lockedUntil: z.number().nullable(),
});

async function readBlobJson(pathname: string): Promise<unknown | null> {
  try {
    const result = await get(pathname, { access: "private" });
    if (!result) return null;
    return await new Response(result.stream).json();
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

interface LogEntry { step: string; message: string }

export async function POST(req: Request): Promise<NextResponse> {
  const secret = req.headers.get("X-Migration-Secret");
  if (!process.env.MIGRATION_SECRET || secret !== process.env.MIGRATION_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL no configurada en este entorno." }, { status: 500 });
  }

  const logs: LogEntry[] = [];
  const log = (step: string, message: string) => logs.push({ step, message });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    // --- invoice-history ---
    const rawHistory = await readBlobJson("fact-vet/invoice-history.json");
    if (rawHistory === null) {
      log("invoice-history", "Nada guardado en Blob. Nada que migrar.");
    } else {
      const parsed = z.array(invoiceHistoryEntrySchema).safeParse(rawHistory);
      if (!parsed.success) {
        return NextResponse.json({ error: "invoice-history no pasa el schema", issues: parsed.error.issues, logs }, { status: 422 });
      }
      for (const entry of parsed.data) {
        await pool.query(
          `INSERT INTO invoices (invoice_id, invoice_number, cufe, status, consultation_id, payment_method, observations, emitted_at, form_snapshot)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (invoice_id) DO UPDATE SET
             invoice_number = EXCLUDED.invoice_number, cufe = EXCLUDED.cufe, status = EXCLUDED.status,
             consultation_id = EXCLUDED.consultation_id, payment_method = EXCLUDED.payment_method,
             observations = EXCLUDED.observations, emitted_at = EXCLUDED.emitted_at, form_snapshot = EXCLUDED.form_snapshot`,
          [
            entry.invoiceId, entry.invoiceNumber ?? null, entry.cufe, entry.status, entry.consultationId,
            entry.paymentMethod, entry.observations ?? null, entry.emittedAt,
            entry.formSnapshot ? JSON.stringify(entry.formSnapshot) : null,
          ],
        );
      }
      log("invoice-history", `${parsed.data.length} facturas migradas.`);
    }

    // --- catalog-mapping ---
    const rawMapping = await readBlobJson("fact-vet/catalog-mapping.json");
    if (rawMapping === null) {
      log("catalog-mapping", "Nada guardado en Blob. Se deja la fila por defecto.");
    } else {
      const parsed = catalogMappingSchema.safeParse(rawMapping);
      if (!parsed.success) {
        return NextResponse.json({ error: "catalog-mapping no pasa el schema", issues: parsed.error.issues, logs }, { status: 422 });
      }
      const m = parsed.data;
      await pool.query(
        `UPDATE catalog_mapping SET items=$1, payments=$2, version=$3, document_type_id=$4, credit_note_document_type_id=$5, seller_id=$6, updated_at=$7 WHERE id = 1`,
        [JSON.stringify(m.items), JSON.stringify(m.payments), m.version, m.documentTypeId ?? null, m.creditNoteDocumentTypeId ?? null, m.sellerId ?? null, m.updatedAt],
      );
      log("catalog-mapping", `Migrado: version=${m.version}, ${m.items.length} items, ${m.payments.length} formas de pago.`);
    }

    // --- credentials-config ---
    const rawConfig = await readBlobJson("fact-vet/credentials-config.json");
    if (rawConfig === null) {
      log("credentials-config", "Nada guardado en Blob. Se deja la fila por defecto (sandbox).");
    } else {
      const parsed = credentialsConfigSchema.safeParse(rawConfig);
      if (!parsed.success) {
        return NextResponse.json({ error: "credentials-config no pasa el schema", issues: parsed.error.issues, logs }, { status: 422 });
      }
      const c = parsed.data;
      await pool.query(
        `UPDATE credentials_config SET mode=$1, configured=$2, updated_at=$3 WHERE id = 1`,
        [c.mode, JSON.stringify(c.configured), c.updatedAt],
      );
      log("credentials-config", `Migrado: mode=${c.mode}.`);
    }

    // --- login-rate-limit ---
    const { blobs } = await list({ prefix: "fact-vet/login-rate-limit/" });
    if (blobs.length === 0) {
      log("login-rate-limit", "No hay registros guardados. Nada que migrar.");
    } else {
      let migrated = 0;
      for (const blob of blobs) {
        const match = blob.pathname.match(/login-rate-limit\/([0-9a-f]{64})\.json$/);
        if (!match) continue;
        const emailHash = match[1];
        const raw = await readBlobJson(blob.pathname);
        if (raw === null) continue;
        const parsed = rateLimitStateSchema.safeParse(raw);
        if (!parsed.success) continue;
        await pool.query(
          `INSERT INTO login_rate_limits (email_hash, attempts, locked_until) VALUES ($1, $2, $3)
           ON CONFLICT (email_hash) DO UPDATE SET attempts = EXCLUDED.attempts, locked_until = EXCLUDED.locked_until`,
          [emailHash, JSON.stringify(parsed.data.attempts), parsed.data.lockedUntil],
        );
        migrated++;
      }
      log("login-rate-limit", `${migrated}/${blobs.length} registros migrados.`);
    }

    return NextResponse.json({ ok: true, logs });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err), logs }, { status: 500 });
  } finally {
    await pool.end();
  }
}