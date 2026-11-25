import { describe, expect, it } from "vitest";
import { benefits, steps, PROMISES, SLOGAN, SUBTITLE } from "./home";
import { features } from "./features";
import { audiences } from "./audiences";
import { faqItems } from "./faq";
import { legalInfo, shown, TO_COMPLETE } from "./legal";

describe("contenu de la vitrine", () => {
  it("reprend exactement le slogan, le sous-titre et les promesses", () => {
    expect(SLOGAN).toBe("L’accompagnement individuel, enfin structuré.");
    expect(SUBTITLE).toBe("Centralisez les demandes, suivez les échanges et pilotez la qualité de votre accompagnement.");
    expect(PROMISES).toEqual(["Demandes centralisées", "Suivi des délais"]);
  });

  it("reste généraliste et sans prix écrit en dur", () => {
    const all = JSON.stringify([benefits, steps, features, audiences, faqItems]);
    expect(all).not.toMatch(/brvm|bourse|trading/i);
    expect(all).not.toMatch(/\d\s*(FCFA|XOF|€)/i);
  });

  it("propose au moins six questions fréquentes complètes", () => {
    expect(faqItems.length).toBeGreaterThanOrEqual(6);
    for (const f of faqItems) {
      expect(f.question.endsWith("?")).toBe(true);
      expect(f.answer.length).toBeGreaterThan(30);
    }
  });

  it("affiche « À compléter » plutôt que « undefined » quand une information légale manque", () => {
    const empty = legalInfo({});
    expect(empty).toEqual({ company: null, address: null, email: null, phone: null });
    expect(shown(empty.company)).toBe(TO_COMPLETE);
    expect(shown(legalInfo({ LEGAL_COMPANY_NAME: " Mentora SARL " }).company)).toBe("Mentora SARL");
    expect(shown(legalInfo({ LEGAL_EMAIL: "  " }).email)).toBe(TO_COMPLETE);
  });
});
