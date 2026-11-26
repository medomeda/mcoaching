import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { DEFAULT_BRAND_NAME } from "@/modules/core/branding";

/**
 * Manifeste de la PWA : installation sur l'écran d'accueil (Android, iPhone, ordinateur).
 * Le nom est celui défini par l'administrateur de l'instance (même source que le titre de l'onglet).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = DEFAULT_BRAND_NAME;
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    await connection();
    const { getBrandName } = await import("@/server/live/branding");
    name = await getBrandName();
  }
  return {
    id: "/",
    name,
    short_name: name.length > 12 ? name.slice(0, 12).trimEnd() : name,
    description: `${name} — plateforme d’accompagnement individuel : demandes, échanges, délais et suivi au même endroit.`,
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7fa",
    theme_color: "#0e2340",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
