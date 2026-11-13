import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/server/pg/client";

export const dynamic = "force-dynamic";

/** Sonde de santé (Docker / Coolify) : répond 200 seulement si la base PostgreSQL est joignable. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "database_unavailable" }, { status: 503 });
  }
}
