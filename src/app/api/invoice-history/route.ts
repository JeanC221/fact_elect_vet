import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/services/db";
import { invoiceHistoryEntrySchema, type InvoiceHistoryEntry } from "@/mappers/invoiceHistory";

export const dynamic = "force-dynamic";

const EMPTY_HISTORY: InvoiceHistoryEntry[] = [];
void EMPTY_HISTORY; // kept for quick revert after debugging

const putBodySchema = z.union([
  z.object({ entries: z.array(invoiceHistoryEntrySchema) }),
  z.object({ entry: invoiceHistoryEntrySchema }),
]);

interface InvoiceRow {
  invoice_id: string;
  invoice_number: string | null;
  cufe: string;
  status: string;
  consultation_id: string;
  payment_method: string;
  observations: string | null;
  emitted_at: Date;
  form_snapshot: unknown;
  created_at: Date;
}

function rowToEntry(row: InvoiceRow): InvoiceHistoryEntry {
  return {
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number ?? undefined,
    cufe: row.cufe,
    status: row.status as InvoiceHistoryEntry["status"],
    consultationId: row.consultation_id,
    paymentMethod: row.payment_method,
    observations: row.observations ?? undefined,
    emittedAt: row.emitted_at,
    formSnapshot: (row.form_snapshot ?? undefined) as InvoiceHistoryEntry["formSnapshot"],
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const pool = getPool();
    // created_at ASC preserves original insertion order — matches the old
    // Blob array's append order and what the UI/tests expect.
    const result = await pool.query<InvoiceRow>(
      "SELECT invoice_id, invoice_number, cufe, status, consultation_id, payment_method, observations, emitted_at, form_snapshot, created_at FROM invoices ORDER BY created_at ASC",
    );
    const entries = result.rows.map(rowToEntry);
    const parsed = z.array(invoiceHistoryEntrySchema).safeParse(entries);
    if (!parsed.success) {
      // TEMP DEBUG — remove after diagnosing the production 503.
      return NextResponse.json({ __debug: "zod_validation_failed", issues: parsed.error.issues, sampleRow: entries[0] ?? null }, { status: 503 });
    }
    return NextResponse.json(parsed.data);
  } catch (err) {
    // TEMP DEBUG — remove after diagnosing the production 503.
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return NextResponse.json({ __debug: "exception_thrown", message, stack }, { status: 503 });
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
  let parsed;
  try {
    const body = await req.json();
    parsed = putBodySchema.safeParse(body);
  } catch {
    return NextResponse.json({ error: { code: "invalid_payload", message: "JSON inválido en el cuerpo de la petición." } }, { status: 400 });
  }
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
    return NextResponse.json({ error: { code: "invalid_payload", message: `Historial inválido: ${detail}` } }, { status: 400 });
  }
  const incoming = "entries" in parsed.data ? parsed.data.entries : [parsed.data.entry];

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const entry of incoming) {
      await client.query(
        `INSERT INTO invoices (invoice_id, invoice_number, cufe, status, consultation_id, payment_method, observations, emitted_at, form_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (invoice_id) DO UPDATE SET
           invoice_number = EXCLUDED.invoice_number,
           cufe = EXCLUDED.cufe,
           status = EXCLUDED.status,
           consultation_id = EXCLUDED.consultation_id,
           payment_method = EXCLUDED.payment_method,
           observations = EXCLUDED.observations,
           emitted_at = EXCLUDED.emitted_at,
           form_snapshot = EXCLUDED.form_snapshot`,
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
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    const message = err instanceof Error ? err.message : "Error al guardar el historial.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 500 });
  } finally {
    client.release();
  }

  try {
    const result = await pool.query<InvoiceRow>(
      "SELECT invoice_id, invoice_number, cufe, status, consultation_id, payment_method, observations, emitted_at, form_snapshot, created_at FROM invoices ORDER BY created_at ASC",
    );
    return NextResponse.json(result.rows.map(rowToEntry));
  } catch {
    // Write succeeded but the confirmation read failed — the data is safe;
    // report a storage-read problem rather than claiming the write failed.
    return NextResponse.json({ error: { code: "storage_unavailable", message: "El historial se guardó pero no se pudo confirmar la lectura." } }, { status: 503 });
  }
}
