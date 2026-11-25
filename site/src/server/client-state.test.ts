import { describe, expect, it } from "vitest";
import { withTestDb } from "@/test/db";
import { client, healthCheck, usageSnapshot } from "@/db/schema";
import { loadClientStates } from "./client-state";

describe("loadClientStates", () => {
  it("utilise le dernier contrôle, le dernier relevé et seulement les contrôles des 24 dernières heures pour l'état hors ligne", async () => {
    await withTestDb(async (db) => {
      const now = new Date("2027-03-10T12:00:00Z");
      const min = (m: number) => new Date(now.getTime() - m * 60_000);
      const [c] = await db.insert(client).values({ name: "A", instanceHost: "a", status: "ACTIF" }).returning();
      // Anciens échecs (> 24 h) : ne doivent pas compter dans la série d'échecs en cours.
      await db.insert(healthCheck).values(Array.from({ length: 50 }, (_, i) => ({ clientId: c!.id, checkedAt: min(60 * 30 + i), ok: false, latencyMs: 1 })));
      await db.insert(healthCheck).values([
        { clientId: c!.id, checkedAt: min(40), ok: true, latencyMs: 1 },
        { clientId: c!.id, checkedAt: min(20), ok: false, latencyMs: 1 },
        { clientId: c!.id, checkedAt: min(5), ok: false, latencyMs: 1 },
      ]);
      await db.insert(usageSnapshot).values([
        { clientId: c!.id, day: "2027-03-08", counters: { members_active: 1, coaches_active: 1, suspended: false, last_activity_at: null } },
        { clientId: c!.id, day: "2027-03-10", counters: { members_active: 9, coaches_active: 2, suspended: false, last_activity_at: null } },
      ]);
      const { states, lastCheck } = await loadClientStates(db, now);
      expect(states[0]!.offlineSince).toEqual(min(20));
      expect(states[0]!.usage).toMatchObject({ members_active: 9, coaches_active: 2 });
      expect(lastCheck.get(c!.id)).toEqual({ ok: false, at: min(5) });
    });
  });

  it("client jamais contrôlé : aucune erreur, état vide", async () => {
    await withTestDb(async (db) => {
      await db.insert(client).values({ name: "B", status: "ESSAI" });
      const { states, lastCheck } = await loadClientStates(db);
      expect(states[0]).toMatchObject({ offlineSince: null, usage: null });
      expect(lastCheck.size).toBe(0);
    });
  });
});
