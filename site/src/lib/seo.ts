import type { Metadata } from "next";
import type { FaqItem } from "@/content/faq";
import { SLOGAN, SUBTITLE } from "@/content/home";
import type { PublicPlan } from "./plans";

export const siteUrl = () => (process.env.SITE_URL || "http://localhost:3601").replace(/\/+$/, "");

export const PAGES: Record<string, { title: string; description: string }> = {
  "/": { title: "Mentora — logiciel d’accompagnement individuel", description: `${SLOGAN} ${SUBTITLE}` },
  "/fonctionnalites": { title: "Fonctionnalités", description: "Demandes, échanges, délais, droits d’accompagnement, rapports : tout pour structurer l’accompagnement individuel de vos membres." },
  "/pour-qui": { title: "Pour coachs, formateurs et mentors", description: "Mentora aide les coachs indépendants, formateurs et mentors à centraliser les demandes et à tenir leurs délais de réponse." },
  "/tarifs": { title: "Tarifs", description: "Découvrez les formules Mentora et demandez votre essai gratuit pour tester l’outil avec vos propres membres." },
  "/faq": { title: "Questions fréquentes", description: "Essai gratuit, confidentialité des données, personnalisation, résiliation : les réponses aux questions les plus courantes sur Mentora." },
  "/essai": { title: "Demander un essai gratuit", description: "Demandez votre essai gratuit de Mentora : nous vous répondons et préparons votre espace d’accompagnement individuel." },
  "/mentions-legales": { title: "Mentions légales", description: "Mentions légales du site Mentora : éditeur, hébergement et propriété intellectuelle du service d’accompagnement." },
  "/conditions": { title: "Conditions d’utilisation", description: "Conditions d’utilisation du service Mentora : essai, abonnement, responsabilités, données, suspension et résiliation." },
  "/confidentialite": { title: "Politique de confidentialité", description: "Comment Mentora traite vos données : demandes d’essai, espaces clients séparés, durée de conservation et vos droits." },
};

/** Métadonnées d'une page : titre, description, canonique, Open Graph et Twitter. */
export function pageMetadata(path: keyof typeof PAGES | string): Metadata {
  const p = PAGES[path];
  if (!p) throw new Error(`Page inconnue : ${path}`);
  const url = `${siteUrl()}${path === "/" ? "" : path}`;
  const title = path === "/" ? { absolute: p.title } : p.title;
  return {
    title,
    description: p.description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title: p.title, description: p.description, siteName: "Mentora", locale: "fr_FR" },
    twitter: { card: "summary", title: p.title, description: p.description },
  };
}

export const organizationLd = () => ({ "@context": "https://schema.org", "@type": "Organization", name: "Mentora", url: siteUrl() });

export const faqLd = (items: FaqItem[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: i.answer } })),
});

/** `offers` n'existe que s'il y a au moins une formule publiée avec un prix mensuel. */
export function softwareLd(plans: PublicPlan[]): Record<string, unknown> {
  const base = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Mentora",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: SUBTITLE,
    inLanguage: "fr",
  };
  const offers = plans
    .filter((p) => p.monthlyPrice !== null)
    .map((p) => ({ "@type": "Offer", name: p.name, price: String(p.monthlyPrice), priceCurrency: "XOF", category: "Abonnement mensuel" }));
  return offers.length > 0 ? { ...base, offers } : base;
}
