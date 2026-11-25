import { describe, expect, it } from "vitest";
import { withTestDb } from "@/test/db";
import { client, plan, usageSnapshot } from "./schema";

describe("schéma", () => {
  it("refuse deux relevés d'usage pour le même client et le même jour", async () => {
    await withTestDb(async (db) => {
      const [c] = await db.insert(client).values({ name: "Acme" }).returning();
      const row = { clientId: c!.id, day: "2027-01-10", counters: { members_active: 3 } };
      await db.insert(usageSnapshot).values(row);
      await expect(db.insert(usageSnapshot).values(row)).rejects.toThrow();
    });
  });

  it("accepte une formule sans prix annuel ni limites (illimité)", async () => {
    await withTestDb(async (db) => {
      const [p] = await db.insert(plan).values({ slug: "equipe", name: "Équipe" }).returning();
      expect(p!.annualPrice).toBeNull();
      expect(p!.maxMembers).toBeNull();
      expect(p!.trialDays).toBe(30);
      expect(p!.published).toBe(false);
    });
  });
});
