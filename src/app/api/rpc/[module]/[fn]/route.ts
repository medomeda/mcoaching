/**
 * Point d'entrée unique de l'API métier : POST /api/rpc/<module>/<fonction> avec `{ args: [...] }`.
 * Réponse `{ data }` ou `{ error: { code, message, fieldErrors } }` avec le statut HTTP de l'erreur.
 */
import { APIError } from "better-auth/api";
import { NextResponse, type NextRequest } from "next/server";
import { AppError, isAppError } from "@/modules/core/errors";
import { liveModules } from "@/server/live/registry";
import { appUrl } from "@/server/appUrl";

/** Contenu binaire (pièces jointes) transmis en base64 sous la forme `{ $bytes }` par le client. */
function reviveBytes(_key: string, value: unknown) {
  if (value && typeof value === "object" && typeof (value as { $bytes?: unknown }).$bytes === "string") {
    const buf = Buffer.from((value as { $bytes: string }).$bytes, "base64");
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  return value;
}

function fail(e: AppError) {
  return NextResponse.json({ error: { code: e.code, message: e.message, fieldErrors: e.fieldErrors } }, { status: e.status });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ module: string; fn: string }> }) {
  const { module, fn } = await ctx.params;
  const handler = Object.hasOwn(liveModules, module) && Object.hasOwn(liveModules[module]!, fn) ? liveModules[module]![fn] : undefined;
  if (!handler) return fail(new AppError("NOT_FOUND", "Opération inconnue."));

  // Protection CSRF : JSON obligatoire (impose un pré-vol CORS) et origine identique si présente.
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    return fail(new AppError("VALIDATION", "Requête invalide."));
  }
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin && origin !== appUrl()) {
    return fail(new AppError("FORBIDDEN", "Origine non autorisée."));
  }

  let args: unknown[];
  try {
    const body = JSON.parse(await req.text(), reviveBytes) as { args?: unknown };
    args = Array.isArray(body.args) ? body.args : [];
  } catch {
    return fail(new AppError("VALIDATION", "Requête invalide."));
  }

  try {
    const data = await (handler as (...a: unknown[]) => Promise<unknown>)({ headers: req.headers }, ...args);
    return NextResponse.json({ data: data ?? null });
  } catch (e) {
    if (isAppError(e)) return fail(e);
    if (e instanceof APIError && e.statusCode === 429) {
      return fail(new AppError("RATE_LIMITED", "Trop de tentatives. Réessayez dans 15 minutes."));
    }
    console.error(`[rpc ${module}.${fn}]`, e);
    return fail(new AppError("INTERNAL", "Une erreur inattendue est survenue. Réessayez."));
  }
}
