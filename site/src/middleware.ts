import { NextResponse, type NextRequest } from "next/server";
import { classifyHost, decide } from "@/lib/host";

/** Routage par nom d'hôte, appliqué avant tout rendu. On ne lit que `host` (jamais `x-forwarded-host`, falsifiable). */
export function middleware(req: NextRequest) {
  const kind = classifyHost(req.headers.get("host"), {
    siteUrl: process.env.SITE_URL ?? "",
    adminHost: process.env.ADMIN_HOST ?? "",
  });
  if (decide(kind, req.nextUrl.pathname) === "notfound") {
    return new NextResponse("Introuvable", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const res = NextResponse.next();
  const adminPath = req.nextUrl.pathname === "/admin" || req.nextUrl.pathname.startsWith("/admin/") || req.nextUrl.pathname.startsWith("/api/admin");
  if (kind === "admin" || (kind === "both" && adminPath)) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
