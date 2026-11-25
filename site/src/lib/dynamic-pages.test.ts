import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * SITE_URL et LEGAL_* sont lues à l'exécution (Coolify les fournit « à l'exécution », pas à la compilation) :
 * toute page ou route qui les utilise doit être rendue à la demande, sinon la valeur de la compilation reste figée dans le HTML.
 */
const FILES = [
  "(public)/page.tsx", "(public)/fonctionnalites/page.tsx", "(public)/pour-qui/page.tsx", "(public)/faq/page.tsx",
  "(public)/essai/page.tsx", "(public)/tarifs/page.tsx", "(public)/mentions-legales/page.tsx", "(public)/conditions/page.tsx",
  "(public)/confidentialite/page.tsx", "sitemap.ts", "robots.ts",
];

describe("rendu à la demande des pages qui dépendent de l'environnement", () => {
  it.each(FILES)("%s déclare dynamic = force-dynamic", (f) => {
    const src = readFileSync(new URL(`../app/${f}`, import.meta.url), "utf8");
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
  });
});
