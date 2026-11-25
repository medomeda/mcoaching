import type { MetadataRoute } from "next";
import { PAGES, siteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.keys(PAGES).map((path) => ({ url: `${siteUrl()}${path === "/" ? "" : path}`, changeFrequency: "monthly", priority: path === "/" ? 1 : 0.7 }));
}
