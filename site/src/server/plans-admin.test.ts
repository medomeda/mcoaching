import { describe, expect, it, vi } from "vitest";
import { withTestDb } from "@/test/db";
import { auditLog } from "@/db/schema";
import { queryPublishedPlans } from "@/lib/plans";
import { reorderPlans, savePlan, setPublished } from "./plans-admin";

const base = { name: "Solo", monthlyPrice: 10000, maxCoaches: 1, maxMembers: 10, features: ["Support par e-mail"] };

describe("gestion des formules", () => {
  it("n'est publique que si elle est publiée ; la dépublication la retire", async () => {
    await withTestDb(async (db) => {
      const revalidate = vi.fn();
      const deps = { db, revalidate };
      const p = await savePlan({ ...base, published: false }, deps);
      expect(await queryPublishedPlans(db)).toEqual([]);
      await setPublished(p.id, true, deps);
      expect((await queryPublishedPlans(db)).map((x) => x.name)).toEqual(["Solo"]);
      await setPublished(p.id, false, deps);
      expect(await queryPublishedPlans(db)).toEqual([]);
      expect(revalidate).toHaveBeenCalledTimes(3);
    });
  });

  it("refuse un prix négatif et une remise supérieure à 100 %", async () => {
    await withTestDb(async (db) => {
      const deps = { db, revalidate: vi.fn() };
      await expect(savePlan({ ...base, monthlyPrice: -1 }, deps)).rejects.toThrow();
      await expect(savePlan({ ...base, annualDiscountPercent: 101 }, deps)).rejects.toThrow();
      expect(deps.revalidate).not.toHaveBeenCalled();
    });
  });

  it("enregistre une limite vide en null (illimité)", async () => {
    await withTestDb(async (db) => {
      const p = await savePlan({ ...base, maxCoaches: "", maxMembers: null }, { db, revalidate: vi.fn() });
      expect(p.maxCoaches).toBeNull();
      expect(p.maxMembers).toBeNull();
    });
  });

  it("met à jour une formule existante et réordonne", async () => {
    await withTestDb(async (db) => {
      const deps = { db, revalidate: vi.fn() };
      const a = await savePlan({ ...base, name: "Solo", published: true }, deps);
      const b = await savePlan({ ...base, name: "Pro", published: true }, deps);
      const a2 = await savePlan({ ...base, id: a.id, name: "Solo+", published: true }, deps);
      expect(a2.id).toBe(a.id);
      await reorderPlans([b.id, a.id], deps);
      expect((await queryPublishedPlans(db)).map((x) => x.name)).toEqual(["Pro", "Solo+"]);
    });
  });

  it("chaque action écrit dans le journal sans secret", async () => {
    await withTestDb(async (db) => {
      const deps = { db, revalidate: vi.fn() };
      const p = await savePlan({ ...base }, deps);
      await setPublished(p.id, true, deps);
      await reorderPlans([p.id], deps);
      const actions = (await db.select().from(auditLog)).map((r) => r.action).sort();
      expect(actions).toEqual(["PLAN_PUBLISHED", "PLAN_REORDERED", "PLAN_SAVED"]);
    });
  });

  it("deux formules ne peuvent pas partager le même identifiant court", async () => {
    await withTestDb(async (db) => {
      const deps = { db, revalidate: vi.fn() };
      const a = await savePlan({ ...base, name: "Équipe" }, deps);
      const b = await savePlan({ ...base, name: "Équipe" }, deps);
      expect(a.slug).toBe("equipe");
      expect(b.slug).not.toBe(a.slug);
    });
  });
});
