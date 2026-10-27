/**
 * Téléchargement d'une pièce jointe (REC-17) : session et droit d'accès à la demande vérifiés
 * à chaque appel ; aucun lien permanent ni mise en cache partagée.
 */
import { NextResponse, type NextRequest } from "next/server";
import { AppError, isAppError } from "@/modules/core/errors";
import { readAttachment } from "@/server/live/requests";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const file = await readAttachment({ headers: req.headers }, id);
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "content-type": file.mime,
        "content-length": String(file.data.byteLength),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    const err = isAppError(e) ? e : new AppError("INTERNAL", "Une erreur inattendue est survenue. Réessayez.");
    if (!isAppError(e)) console.error("[attachments]", e);
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
