import { NextResponse } from "next/server";
import { put, head } from "@vercel/blob";
import { catalogMappingSchema, type CatalogMapping } from "@/mappers/catalogMapping";

export const dynamic = "force-dynamic";

/** Fixed, well-known Blob pathname — single shared mapping doc for the whole app (one clinic, one config). */
const BLOB_PATHNAME = "fact-vet/catalog-mapping.json";

const EMPTY_MAPPING: CatalogMapping = {
  items: [],
  payments: [],
  version: 0,
  updatedAt: "1970-01-01T00:00:00.000Z",
  documentTypeId: null,
  creditNoteDocumentTypeId: null,
  sellerId: null,
};

export async function GET(): Promise<NextResponse> {
  try {
    const meta = await head(BLOB_PATHNAME).catch(() => null);
    if (!meta) return NextResponse.json(EMPTY_MAPPING);
    const res = await fetch(meta.url, { cache: "no-store" });
    if (!res.ok) return NextResponse.json(EMPTY_MAPPING);
    const raw = await res.json();
    const parsed = catalogMappingSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json(EMPTY_MAPPING);
    return NextResponse.json(parsed.data);
  } catch {
    return NextResponse.json(EMPTY_MAPPING);
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = catalogMappingSchema.safeParse(body);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
      return NextResponse.json({ error: { code: "invalid_payload", message: `Mapeo inválido: ${detail}` } }, { status: 400 });
    }
    await put(BLOB_PATHNAME, JSON.stringify(parsed.data), {
      access: "public",
      contentType: "application/json",
      allowOverwrite: true,
    });
    return NextResponse.json(parsed.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al guardar el mapeo.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 500 });
  }
}