import type { Metadata } from "next";
import type { ReactNode } from "react";

// L'espace opérateur n'est jamais indexé (en plus de l'en-tête X-Robots-Tag posé par le middleware).
export const metadata: Metadata = { title: { default: "Espace opérateur", template: "%s · Opérateur Mentora" }, robots: { index: false, follow: false } };

export default function AdminRoot({ children }: { children: ReactNode }) {
  return children;
}
