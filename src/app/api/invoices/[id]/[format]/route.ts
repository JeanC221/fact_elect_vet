import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { SiigoApiError, fetchInvoicePdf, fetchInvoiceXml } from "@/services/siigoApi";
import { requireSession } from "@/services/routeGuard";

export const dynamic = "force-dynamic";

/**
 * Shape of a Siigo document id as accepted by this route.
 *
 * Siigo returns an opaque GUID for `invoice.id`, but the official docs do not
 * publish a guaranteed format for it, and the sandbox has been observed
 * returning other consecutive-style identifiers. Pinning this to a strict
 * RFC-4122 UUID would therefore be a guess that could break real downloads,
 * so the schema is deliberately shaped as "the character class a GUID or a
 * Siigo consecutive can contain" rather than a full UUID match.
 *
 * What matters for A1.1 is the character class, not the exact grammar. The
 * allowed set (letters, digits, hyphen) excludes every character needed to
 * abuse the two sinks this value reaches:
 *
 *   - `Content-Disposition: attachment; filename="${id}.${format}"` — a `"`
 *     would close the quoted string and let the caller append arbitrary
 *     header parameters; CR/LF would split the response headers entirely.
 *   - `${SIIGO_API_BASE_URL}/v1/invoices/${id}/${format}` in siigoApi.ts —
 *     `/` and `..` would traverse to a different Siigo resource, `?` and `&`
 *     would inject query parameters, `%` would smuggle an encoded traversal.
 *
 * If the real production format is ever confirmed against live Siigo data,
 * tighten this to `z.string().uuid()`; until then a stricter schema is not
 * evidence-backed.
 */
const invoiceIdSchema = z
  .string()
  .min(1, "El identificador de la factura no puede estar vacío.")
  .max(64, "El identificador de la factura es demasiado largo.")
  .regex(/^[A-Za-z0-9-]+$/, "El identificador de la factura contiene caracteres no permitidos.");

const formatSchema = z.enum(["pdf", "xml"]);

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; format: string } },
): Promise<NextResponse> {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;
  // Validate the id FIRST: an invalid id must never reach the Siigo URL or the
  // Content-Disposition header, regardless of whether the format is also bad.
  const parsedId = invoiceIdSchema.safeParse(params.id);
  if (!parsedId.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_invoice_id",
          message: "Identificador de factura inválido. No se realizó ninguna consulta a Siigo.",
        },
      },
      { status: 400 },
    );
  }
  const id = parsedId.data;

  const parsedFormat = formatSchema.safeParse(params.format);
  if (!parsedFormat.success) {
    return NextResponse.json(
      { error: { code: "invalid_format", message: "Formato inválido: use pdf o xml." } },
      { status: 400 },
    );
  }
  const format = parsedFormat.data;

  try {
    const { accessToken, partnerId } = await getSiigoAccessToken();
    const blob = await (format === "pdf" ? fetchInvoicePdf : fetchInvoiceXml)(id, accessToken, partnerId);
    const buffer = Buffer.from(await blob.arrayBuffer());
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/xml",
        // `id` is guaranteed [A-Za-z0-9-] by invoiceIdSchema above, so the
        // quoted filename cannot be broken out of.
        "Content-Disposition": `attachment; filename="${id}.${format}"`,
      },
    });
  } catch (err) {
    if (err instanceof SiigoAuthError) {
      return NextResponse.json({ error: { code: err.code, message: "Error de autenticacion con Siigo." } }, { status: 502 });
    }
    if (err instanceof SiigoApiError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status ?? 502 });
    }
    const message = err instanceof Error ? err.message : "Error inesperado al descargar el documento.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 500 });
  }
}
