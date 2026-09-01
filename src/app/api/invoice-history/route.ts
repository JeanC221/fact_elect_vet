import { NextResponse } from "next/server";
import { put, get, BlobNotFoundError } from "@vercel/blob";
import { z } from "zod";
import { invoiceHistoryEntrySchema, type InvoiceHistoryEntry } from "@/mappers/invoiceHistory";

export const dynamic = "force-dynamic";

/** Fixed, well-known Blob pathname — single shared history doc for the whole app. */
const BLOB_PATHNAME = "fact-vet/invoice-history.json";

const historyArraySchema = z.array(invoiceHistoryEntrySchema);

const EMPTY_HISTORY: InvoiceHistoryEntry[] = [];

export async function GET(): Promise<NextResponse> {
  try {
    const result = await get(BLOB_PATHNAME, { access: "private" });
    if (!result) return NextResponse.json(EMPTY_HISTORY);
    const raw = await new Response(result.stream).json();
    const parsed = historyArraySchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json(EMPTY_HISTORY);
    return NextResponse.json(parsed.data);
  } catch (err) {
    if (err instanceof BlobNotFoundError) return NextResponse.json(EMPTY_HISTORY);
    return NextResponse.json(EMPTY_HISTORY);
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = historyArraySchema.safeParse(body);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
      return NextResponse.json({ error: { code: "invalid_payload", message: `Historial inválido: ${detail}` } }, { status: 400 });
    }
    await put(BLOB_PATHNAME, JSON.stringify(parsed.data), {
      access: "private",
      contentType: "application/json",
      allowOverwrite: true,
    });
    return NextResponse.json(parsed.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al guardar el historial.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 500 });
  }
}