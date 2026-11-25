import type { NextRequest } from "next/server";
import { getAuth } from "@/server/auth";

export const dynamic = "force-dynamic";

export const GET = (req: NextRequest) => getAuth().handler(req);
export const POST = (req: NextRequest) => getAuth().handler(req);
