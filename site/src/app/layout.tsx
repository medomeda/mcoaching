import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3601"),
  title: { default: "Mentora", template: "%s · Mentora" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0e2340" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
