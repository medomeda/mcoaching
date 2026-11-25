import { describe, expect, it } from "vitest";
import { withTestDb } from "@/test/db";
import { plan } from "@/db/schema";
import { annualPriceOf, formatFcfa, limitLabel, queryPublishedPlans } from "./plans";

describe("formatage", () => {
  it("formate les montants en FCFA avec espace insécable", () => {
    expect(formatFcfa(15000)).toBe("15 000 FCFA");
  });
  it("libellé des limites : null = illimité", () => {
    expect(limitLabel(null, "membres")).toBe("Membres illimités");
    expect(limitLabel(1, "coach")).toBe("1 coach");
    expect(limitLabel(20, "membres")).toBe("20 membres");
  });
});

describe("annualPriceOf", () => {
  const base = { monthlyPrice: 10000, annualPrice: null, annualDiscountPercent: 20 };
  it("applique la remise annuelle quand aucun prix annuel n'est saisi", () => {
    expect(annualPriceOf(base)).toBe(96000);
  });
  it("préfère le prix annuel saisi", () => {
    expect(annualPriceOf({ ...base, annualPrice: 90000 })).toBe(90000);
  });
  it("sans remise ni prix annuel saisi, aucun prix annuel n'est inventé", () => {
    expect(annualPriceOf({ monthlyPrice: 10000, annualPrice: null, annualDiscountPercent: 0 })).toBeNull();
  });
  it("renvoie null sans aucun prix", () => {
    expect(annualPriceOf({ monthlyPrice: null, annualPrice: null, annualDiscountPercent: 20 })).toBeNull();
  });
});

describe("queryPublishedPlans", () => {
  it("ne renvoie jamais une formule non publiée et respecte l'ordre", async () => {
    await withTestDb(async (db) => {
      await db.insert(plan).values([
        { slug: "pro", name: "Pro", published: true, position: 2, monthlyPrice: 20000 },
        { slug: "solo", name: "Solo", published: true, position: 1, monthlyPrice: 10000 },
        { slug: "brouillon", name: "Brouillon", published: false, position: 0 },
      ]);
      const plans = await queryPublishedPlans(db);
      expect(plans.map((p) => p.slug)).toEqual(["solo", "pro"]);
    });
  });
  it("renvoie une liste vide sans formule publiée", async () => {
    await withTestDb(async (db) => {
      await db.insert(plan).values({ slug: "x", name: "X", published: false });
      expect(await queryPublishedPlans(db)).toEqual([]);
    });
  });
});
