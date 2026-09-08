import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { listOpenClaims, releaseClaimAsAdmin } from "@/services/invoiceClaims";
import { requireAdmin } from "@/services/routeGuard";

export const dynamic = "force-dynamic";

/**
 * Admin view + unblock for emission claims.
 *
 * Admin-only enforcement lives in middleware.ts (ADMIN_ONLY_PREFIXES), which
 * runs at the edge before this handler and returns 403 for the employee role.
 * That is the same mechanism protecting /api/emission-mode — the check is
 * server-side, not merely a hidden button.
 *
 * Exists because the claim design deliberately keeps a consultation blocked
 * when a Siigo call fails ambiguously (timeout, dropped socket, 5xx). Without
 * an unblock path, one dropped connection wedges that consultation forever and
 * the only remedy is hand-written SQL against the production database.
 */

const consultationIdSchema = z
  .string()
  .trim()
  .min(1, "consultationId requerido.")
  .max(100, "consultationId demasiado largo.");

/** GET — list every claim an admin might need to act on (anything not cleanly emitted). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  try {
    const claims = await listOpenClaims();
    return NextResponse.json({ claims, count: claims.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar las emisiones bloqueadas.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 500 });
  }
}

/** DELETE ?consultationId=… — release a stuck claim so the consultation can be billed again. */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.response;
  const raw = new URL(req.url).searchParams.get("consultationId");
  const parsed = consultationIdSchema.safeParse(raw ?? "");
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_consultation_id", message: "Debe indicar la consulta a desbloquear." } },
      { status: 400 },
    );
  }

  try {
    const outcome = await releaseClaimAsAdmin(parsed.data);
    if (outcome === "released") {
      return NextResponse.json({ released: true, consultationId: parsed.data });
    }
    if (outcome === "not_found") {
      return NextResponse.json(
        { error: { code: "claim_not_found", message: "Esta consulta no tiene ninguna emisión bloqueada." } },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "claim_emitted",
          message:
            "Esta consulta ya tiene una factura emitida ante la DIAN. Desbloquearla permitiría emitir un documento duplicado. " +
            "Para volver a facturarla, anule la factura con una nota crédito.",
        },
      },
      { status: 409 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al desbloquear la consulta.";
    return NextResponse.json({ error: { code: "default", message } }, { status: 500 });
  }
}
