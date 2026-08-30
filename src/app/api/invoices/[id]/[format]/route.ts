import { NextResponse } from "next/server";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { SiigoApiError, fetchInvoicePdf, fetchInvoiceXml } from "@/services/siigoApi";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string; format: string } },
): Promise<NextResponse> {
  const { id, format } = params;
  if (format !== "pdf" && format !== "xml") {
    return NextResponse.json({ error: { code: "invalid_format", message: "Formato inválido: use pdf o xml." } }, { status: 400 });
  }
  try {
    const { accessToken, partnerId } = await getSiigoAccessToken();
    const blob = await (format === "pdf" ? fetchInvoicePdf : fetchInvoiceXml)(id, accessToken, partnerId);
    const buffer = Buffer.from(await blob.arrayBuffer());
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/xml",
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