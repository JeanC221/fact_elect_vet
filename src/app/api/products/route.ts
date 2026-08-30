import { NextResponse } from "next/server";
import { z } from "zod";
import { siigoProductSchema } from "@/schemas/siigo";
import { getSiigoAccessToken, SiigoAuthError } from "@/services/siigoAuth";
import { SiigoApiError } from "@/services/siigoApi";
import { mockSiigoProducts } from "@/mocks/siigo";

export const dynamic = "force-dynamic";

const productsPageSchema = z.object({ results: z.array(siigoProductSchema) });


export async function GET(): Promise<NextResponse> {
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
      return NextResponse.json(mockSiigoProducts);
    }
    if (!res.ok) throw new SiigoApiError("default", `Siigo products HTTP ${res.status}.`, res.status);
    const parsed = productsPageSchema.safeParse(await res.json());
    if (!parsed.success) return NextResponse.json(mockSiigoProducts);
    return NextResponse.json(parsed.data.results);
  } catch (err) {
    if (err instanceof SiigoAuthError || err instanceof SiigoApiError) return NextResponse.json(mockSiigoProducts);
    const message = err instanceof Error ? err.message : "Error al obtener productos.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 502 });
  }
}