import { NextResponse } from "next/server";
import { getPool } from "@/services/db";
import { catalogMappingSchema, type CatalogMapping } from "@/mappers/catalogMapping";

export const dynamic = "force-dynamic";

const EMPTY_MAPPING: CatalogMapping = {
  items: [],
  payments: [],
  version: 0,
  updatedAt: "1970-01-01T00:00:00.000Z",
  documentTypeId: null,
  creditNoteDocumentTypeId: null,
  sellerId: null,
};

interface CatalogMappingRow {
  items: unknown;
  payments: unknown;
  version: number;
  document_type_id: number | null;
  credit_note_document_type_id: number | null;
  seller_id: number | null;
  updated_at: Date;
}

function rowToMapping(row: CatalogMappingRow): CatalogMapping {
  return {
    items: row.items as CatalogMapping["items"],
    payments: row.payments as CatalogMapping["payments"],
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
    documentTypeId: row.document_type_id,
    creditNoteDocumentTypeId: row.credit_note_document_type_id,
    sellerId: row.seller_id,
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const pool = getPool();
    const result = await pool.query<CatalogMappingRow>(
      "SELECT items, payments, version, document_type_id, credit_note_document_type_id, seller_id, updated_at FROM catalog_mapping WHERE id = 1",
    );
    if (result.rowCount === 0) return NextResponse.json(EMPTY_MAPPING);
    const parsed = catalogMappingSchema.safeParse(rowToMapping(result.rows[0]));
    if (!parsed.success) return NextResponse.json(EMPTY_MAPPING, { status: 503 });
    return NextResponse.json(parsed.data);
  } catch {
    return NextResponse.json(EMPTY_MAPPING, { status: 503 });
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
  let parsed;
  try {
    const body = await req.json();
    parsed = catalogMappingSchema.safeParse(body);
  } catch {
    return NextResponse.json({ error: { code: "invalid_payload", message: "JSON inválido en el cuerpo de la petición." } }, { status: 400 });
  }
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
    return NextResponse.json({ error: { code: "invalid_payload", message: `Mapeo inválido: ${detail}` } }, { status: 400 });
  }
  const next = parsed.data;

  const pool = getPool();

  let updateResult;
  try {
    updateResult = await pool.query<CatalogMappingRow>(
      `UPDATE catalog_mapping
       SET items = $1, payments = $2, document_type_id = $3, credit_note_document_type_id = $4, seller_id = $5,
           version = version + 1, updated_at = now()
       WHERE id = 1 AND version = $6
       RETURNING items, payments, version, document_type_id, credit_note_document_type_id, seller_id, updated_at`,
      [
        JSON.stringify(next.items),
        JSON.stringify(next.payments),
        next.documentTypeId,
        next.creditNoteDocumentTypeId,
        next.sellerId,
        next.version,
      ],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al guardar el mapeo.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 500 });
  }

  if (updateResult.rowCount && updateResult.rowCount > 0) {
    return NextResponse.json(rowToMapping(updateResult.rows[0]));
  }

  try {
    const current = await pool.query<CatalogMappingRow>(
      "SELECT items, payments, version, document_type_id, credit_note_document_type_id, seller_id, updated_at FROM catalog_mapping WHERE id = 1",
    );
    if (current.rowCount === 0) {
      return NextResponse.json(
        { error: { code: "storage_unavailable", message: "No se encontró el registro de mapeo. Contacte soporte." } },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error: { code: "version_conflict", message: "Otro dispositivo ya guardó cambios. Recargue la página para ver la versión más reciente." },
        current: rowToMapping(current.rows[0]),
      },
      { status: 409 },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "storage_unavailable", message: "No se pudo verificar el estado actual del mapeo." } },
      { status: 503 },
    );
  }
}