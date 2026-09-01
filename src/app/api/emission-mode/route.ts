import { NextResponse } from "next/server";
import { put, get, BlobNotFoundError } from "@vercel/blob";
import { credentialsConfigSchema, type CredentialsConfig } from "@/mappers/credentials";

export const dynamic = "force-dynamic";

/** Fixed, well-known Blob pathname — single shared config doc for the whole app. */
const BLOB_PATHNAME = "fact-vet/credentials-config.json";

const DEFAULT_CONFIG: CredentialsConfig = {
  mode: "sandbox",
  configured: {},
  updatedAt: "1970-01-01T00:00:00.000Z",
};


export async function GET(): Promise<NextResponse> {
  try {
    const result = await get(BLOB_PATHNAME, { access: "private" });
    if (!result) return NextResponse.json(DEFAULT_CONFIG);
    const raw = await new Response(result.stream).json();
    const parsed = credentialsConfigSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json(DEFAULT_CONFIG);
    return NextResponse.json(parsed.data);
  } catch (err) {
    if (err instanceof BlobNotFoundError) return NextResponse.json(DEFAULT_CONFIG);
    return NextResponse.json(DEFAULT_CONFIG);
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = credentialsConfigSchema.safeParse(body);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
      return NextResponse.json({ error: { code: "invalid_payload", message: `Configuración inválida: ${detail}` } }, { status: 400 });
    }
    await put(BLOB_PATHNAME, JSON.stringify(parsed.data), {
      access: "private",
      contentType: "application/json",
      allowOverwrite: true,
    });
    return NextResponse.json(parsed.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al guardar la configuración.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 500 });
  }
}