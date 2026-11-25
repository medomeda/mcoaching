import { describe, expect, it } from "vitest";
import { faqItems } from "@/content/faq";
import { faqLd, organizationLd, PAGES, pageMetadata, softwareLd } from "./seo";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import type { PublicPlan } from "./plans";

const plan = (over: Partial<PublicPlan>): PublicPlan => ({
  id: "1", slug: "solo", name: "Solo", description: "", monthlyPrice: null, annualPrice: null, annualDiscountPercent: 0,
  maxCoaches: 1, maxMembers: 10, trialDays: 30, features: [], highlighted: false, ...over,
});

describe("métadonnées", () => {
  it("chaque page publique a un titre ≤ 60 caractères (gabarit compris) et une description ≤ 160", () => {
    for (const [path, p] of Object.entries(PAGES)) {
      const full = path === "/" ? p.title : `${p.title} · Mentora`;
      expect(full.length, path).toBeLessThanOrEqual(60);
      expect(p.description.length, path).toBeLessThanOrEqual(160);
      expect(p.description.length, path).toBeGreaterThan(50);
    }
  });
  it("URL canonique = SITE_URL + chemin", () => {
    process.env.SITE_URL = "https://mentora.app";
    const m = pageMetadata("/tarifs");
    expect(m.alternates?.canonical).toBe("https://mentora.app/tarifs");
    expect(m.openGraph?.url).toBe("https://mentora.app/tarifs");
  });
});

describe("données structurées", () => {
  it("softwareLd sans formule : pas d'offres", () => {
    expect("offers" in softwareLd([])).toBe(false);
  });
  it("une formule sans prix mensuel n'ajoute pas d'offre", () => {
    expect("offers" in softwareLd([plan({ monthlyPrice: null })])).toBe(false);
    const ld = softwareLd([plan({ monthlyPrice: 10000 }), plan({ id: "2", name: "Équipe", monthlyPrice: null })]) as { offers: { price: string }[] };
    expect(ld.offers).toHaveLength(1);
    expect(ld.offers[0]?.price).toBe("10000");
  });
  it("faqLd reflète les questions", () => {
    const ld = faqLd(faqItems) as { mainEntity: unknown[] };
    expect(ld.mainEntity).toHaveLength(faqItems.length);
  });
  it("organizationLd est sérialisable", () => {
    expect(() => JSON.parse(JSON.stringify(organizationLd()))).not.toThrow();
  });
});

describe("plan du site et robots", () => {
  it("le plan du site ne contient aucun chemin d'administration", () => {
    const urls = sitemap().map((s) => s.url);
    expect(urls.length).toBe(Object.keys(PAGES).length);
    expect(urls.some((u) => u.includes("/admin"))).toBe(false);
  });
  it("robots interdit /admin et référence le plan du site", () => {
    const r = robots();
    expect(JSON.stringify(r.rules)).toContain("/admin");
    expect(r.sitemap).toMatch(/sitemap\.xml$/);
  });
});
