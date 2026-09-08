import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { siigoProductSchema } from "@/schemas/siigo";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { SiigoApiError } from "@/services/siigoApi";
import { requireSession } from "@/services/routeGuard";

export const dynamic = "force-dynamic";

const productsPageSchema = z.object({ results: z.array(siigoProductSchema) });

/**
 * GET /api/products — live Siigo product catalog.
 * Fails loudly on any error (auth, network, malformed response, non-OK
 * status): returns an explicit error status instead of silently substituting
 * mock data with a 200. A silent mock fallback here is indistinguishable
 * from the real catalog in the UI, so a staff member mapping a Provet item
 * code against a mock product id would produce a mapping that fails only
 * later, at real emission time, with a confusing unrelated Siigo error.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSession(req);
  if (!guard.ok) return guard.response;
  try {
    const { accessToken, partnerId } = await getSiigoAccessToken();
    const baseUrl = process.env.SIIGO_API_BASE_URL ?? "https://api.siigo.com";
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/v1/products`, {
        method: "GET",
        headers: { "Partner-Id": partnerId, Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new SiigoApiError("service_unavailable", "No se pudo contactar el servicio de productos de Siigo.");
    }
    if (!res.ok) throw new SiigoApiError("default", `Siigo products HTTP ${res.status}.`, res.status);
    const parsed = productsPageSchema.safeParse(await res.json());
    if (!parsed.success) throw new SiigoApiError("invalid_payload", "La respuesta de productos de Siigo no tiene el formato esperado.");
    return NextResponse.json(parsed.data.results);
  } catch (err) {
    if (err instanceof SiigoAuthError) {
      return NextResponse.json({ error: { code: err.code, message: "Error de autenticación con Siigo. Verifique las credenciales en Configuración." } }, { status: 502 });
    }
    if (err instanceof SiigoApiError) {
      const status = err.status ?? 502;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    const message = err instanceof Error ? err.message : "Error al obtener productos.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 502 });
  }
}