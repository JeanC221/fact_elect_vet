/**
 * One-time migration: Vercel Blob → Supabase Postgres.
 *
 * Reads the 4 existing Blob documents (invoice-history, catalog-mapping,
 * credentials-config, login-rate-limit/*) and inserts them into the
 * Postgres tables created for this migration. Does NOT delete the source
 * blobs — safe to re-run, and safe to keep as a rollback path until the
 * Postgres-backed app has run in production for a few days.
 *
 * Usage (from the project root, with dependencies installed):
 *   BLOB_READ_WRITE_TOKEN=... DATABASE_URL=... npx tsx scripts/migrate-blob-to-postgres.ts
 *
 * Both env vars are required and the script fails fast if either is missing
 * — this mirrors the project's "fail loudly, never silently" principle:
 * a partial/misconfigured migration must not proceed and pretend to have
 * copied everything.
 */
import { list, get, BlobNotFoundError } from "@vercel/blob";
import { Pool } from "pg";
import { z } from "zod";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

if (!BLOB_TOKEN) {
  console.error("ERROR: falta BLOB_READ_WRITE_TOKEN. Cópialo de Vercel (Settings → Environment Variables) y expórtalo antes de correr este script.");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("ERROR: falta DATABASE_URL. Debe ser la connection string de Supabase (modo Transaction, puerto 6543).");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// --- Schemas mirroring the app's existing Zod schemas (duplicated here to
// keep this script standalone and runnable without the Next.js path aliases). ---

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
    const result = await get(pathname, { access: "private", token: BLOB_TOKEN });
    if (!result) return null;
    return await new Response(result.stream).json();
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

async function migrateInvoiceHistory(): Promise<void> {
  console.log("\n--- invoice-history ---");
  const raw = await readBlobJson("fact-vet/invoice-history.json");
  if (raw === null) {
    console.log("Nada guardado en Blob (primera vez / vacío). Nada que migrar.");
    return;
  }
  const parsed = z.array(invoiceHistoryEntrySchema).safeParse(raw);
  if (!parsed.success) {
    console.error("El JSON de invoice-history no pasa el schema esperado. Deteniendo — revisa manualmente antes de continuar.");
    console.error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "));
    process.exit(1);
  }
  console.log(`${parsed.data.length} facturas encontradas en Blob.`);
  for (const entry of parsed.data) {
    await pool.query(
      `INSERT INTO invoices (invoice_id, invoice_number, cufe, status, consultation_id, payment_method, observations, emitted_at, form_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (invoice_id) DO UPDATE SET
         invoice_number = EXCLUDED.invoice_number, cufe = EXCLUDED.cufe, status = EXCLUDED.status,
         consultation_id = EXCLUDED.consultation_id, payment_method = EXCLUDED.payment_method,
         observations = EXCLUDED.observations, emitted_at = EXCLUDED.emitted_at, form_snapshot = EXCLUDED.form_snapshot`,
      [
        entry.invoiceId,
        entry.invoiceNumber ?? null,
        entry.cufe,
        entry.status,
        entry.consultationId,
        entry.paymentMethod,
        entry.observations ?? null,
        entry.emittedAt,
        entry.formSnapshot ? JSON.stringify(entry.formSnapshot) : null,
      ],
    );
  }
  console.log(`${parsed.data.length} facturas insertadas/actualizadas en Postgres.`);
}

async function migrateCatalogMapping(): Promise<void> {
  console.log("\n--- catalog-mapping ---");
  const raw = await readBlobJson("fact-vet/catalog-mapping.json");
  if (raw === null) {
    console.log("Nada guardado en Blob. La tabla ya tiene una fila por defecto (id=1, version=0) del DDL inicial — se deja tal cual.");
    return;
  }
  const parsed = catalogMappingSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("El JSON de catalog-mapping no pasa el schema esperado. Deteniendo.");
    console.error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "));
    process.exit(1);
  }
  const m = parsed.data;
  await pool.query(
    `UPDATE catalog_mapping
     SET items = $1, payments = $2, version = $3, document_type_id = $4, credit_note_document_type_id = $5, seller_id = $6, updated_at = $7
     WHERE id = 1`,
    [
      JSON.stringify(m.items),
      JSON.stringify(m.payments),
      m.version,
      m.documentTypeId ?? null,
      m.creditNoteDocumentTypeId ?? null,
      m.sellerId ?? null,
      m.updatedAt,
    ],
  );
  console.log(`Mapeo migrado (version=${m.version}, ${m.items.length} items, ${m.payments.length} formas de pago).`);
}

async function migrateCredentialsConfig(): Promise<void> {
  console.log("\n--- credentials-config (emission-mode) ---");
  const raw = await readBlobJson("fact-vet/credentials-config.json");
  if (raw === null) {
    console.log("Nada guardado en Blob. La tabla ya tiene la fila por defecto (sandbox) del DDL inicial — se deja tal cual.");
    return;
  }
  const parsed = credentialsConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("El JSON de credentials-config no pasa el schema esperado. Deteniendo.");
    console.error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "));
    process.exit(1);
  }
  const c = parsed.data;
  await pool.query(
    `UPDATE credentials_config SET mode = $1, configured = $2, updated_at = $3 WHERE id = 1`,
    [c.mode, JSON.stringify(c.configured), c.updatedAt],
  );
  console.log(`Config migrada (mode=${c.mode}).`);
}

async function migrateLoginRateLimits(): Promise<void> {
  console.log("\n--- login-rate-limit ---");
  const { blobs } = await list({ prefix: "fact-vet/login-rate-limit/", token: BLOB_TOKEN });
  if (blobs.length === 0) {
    console.log("No hay blobs de rate-limit guardados (normal si nadie ha fallado un login recientemente). Nada que migrar.");
    return;
  }
  console.log(`${blobs.length} registros de rate-limit encontrados en Blob.`);
  let migrated = 0;
  for (const blob of blobs) {
    // Extract the sha256 hash from "fact-vet/login-rate-limit/<hash>.json"
    const match = blob.pathname.match(/login-rate-limit\/([0-9a-f]{64})\.json$/);
    if (!match) {
      console.warn(`Pathname inesperado, saltando: ${blob.pathname}`);
      continue;
    }
    const emailHash = match[1];
    const raw = await readBlobJson(blob.pathname);
    if (raw === null) continue;
    const parsed = rateLimitStateSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(`Registro de rate-limit inválido para hash ${emailHash}, saltando (no crítico — fail-open de todas formas).`);
      continue;
    }
    await pool.query(
      `INSERT INTO login_rate_limits (email_hash, attempts, locked_until)
       VALUES ($1, $2, $3)
       ON CONFLICT (email_hash) DO UPDATE SET attempts = EXCLUDED.attempts, locked_until = EXCLUDED.locked_until`,
      [emailHash, JSON.stringify(parsed.data.attempts), parsed.data.lockedUntil],
    );
    migrated++;
  }
  console.log(`${migrated} registros de rate-limit migrados.`);
}

async function main(): Promise<void> {
  console.log("Migración Vercel Blob → Supabase Postgres");
  console.log("==========================================");
  try {
    await migrateInvoiceHistory();
    await migrateCatalogMapping();
    await migrateCredentialsConfig();
    await migrateLoginRateLimits();
    console.log("\n✓ Migración completa. Los blobs originales NO fueron borrados — verifica la app contra Postgres antes de eliminarlos manualmente en el dashboard de Vercel.");
  } catch (err) {
    console.error("\n✗ La migración falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

void main();