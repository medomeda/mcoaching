import { NextResponse, type NextRequest } from "next/server";
import { checkOpsKey, opsConfigured, opsRateLimited } from "@/server/ops/auth";
import { computeUsage } from "@/server/ops/usage";

export const dynamic = "force-dynamic";

/** Compteurs d'usage pour le tableau de bord de l'opérateur. Absent (404) tant que OPS_API_KEY n'est pas définie. */
export async function GET(req: NextRequest) {
  if (!opsConfigured()) return new NextResponse(null, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
  if (opsRateLimited(ip)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  if (!checkOpsKey(req.headers.get("authorization"))) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  try {
    return NextResponse.json(await computeUsage(new Date()), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
