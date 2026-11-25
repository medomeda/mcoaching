import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkOpsKey, opsConfigured, opsRateLimited } from "@/server/ops/auth";
import { setSuspension } from "@/server/ops/usage";

export const dynamic = "force-dynamic";

const zBody = z.object({ suspended: z.boolean(), message: z.string().max(500).nullable().optional() });

/** Suspend ou réactive l'instance (aucune donnée supprimée). Absent (404) tant que OPS_API_KEY n'est pas définie. */
export async function POST(req: NextRequest) {
  if (!opsConfigured()) return new NextResponse(null, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
  if (opsRateLimited(ip)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  if (!checkOpsKey(req.headers.get("authorization"))) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const body = zBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "VALIDATION" }, { status: 422 });
  await setSuspension(body.data.suspended, body.data.message ?? null);
  return NextResponse.json({ ok: true, suspended: body.data.suspended });
}
