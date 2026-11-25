import type { MetadataRoute } from "next";
import { PAGES, siteUrl } from "@/lib/seo";

// Rendu à la demande : SITE_URL et LEGAL_* sont lues à l'exécution (voir dynamic-pages.test.ts).
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.keys(PAGES).map((path) => ({ url: `${siteUrl()}${path === "/" ? "" : path}`, changeFrequency: "monthly", priority: path === "/" ? 1 : 0.7 }));
}
