import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { DemoToolbar } from "@/components/demo/demo-toolbar";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Coaching BRVM", template: "%s · Coaching BRVM" },
  description: "Plateforme de gestion du coaching individuel pour la communauté d’investissement BRVM.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0e2340" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Providers>
          {children}
          <DemoToolbar />
        </Providers>
      </body>
    </html>
  );
}
