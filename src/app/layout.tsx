import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { DemoToolbar } from "@/components/demo/demo-toolbar";
import { DEFAULT_BRAND_NAME } from "@/modules/core/branding";
import "./globals.css";

/** Titre de l'onglet : nom de la plateforme défini par l'administrateur (base de données) ; valeur par défaut en démo. */
export async function generateMetadata(): Promise<Metadata> {
  let name = DEFAULT_BRAND_NAME;
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    await connection();
    const { getBrandName } = await import("@/server/live/branding");
    name = await getBrandName();
  }
  return {
    title: { default: name, template: `%s · ${name}` },
    description: `${name} — plateforme d’accompagnement individuel : demandes, échanges, délais et suivi au même endroit.`,
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0e2340" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning : des extensions du navigateur (gestionnaires de mots de passe, correcteurs, thèmes sombres)
    // ajoutent des attributs à <html> et <body> avant l'hydratation et provoquent un avertissement sans rapport avec l'application.
    <html lang="fr" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          {children}
          <DemoToolbar />
        </Providers>
      </body>
    </html>
  );
}
