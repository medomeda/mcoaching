import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withTestDb } from "@/test/db";
import { client, healthCheck, usageSnapshot } from "@/db/schema";
import { encryptSecret } from "@/lib/secret-box";
import { runHealthChecks, runUsageSnapshots, type Fetchers } from "./monitoring";

const masterKey = Buffer.alloc(32, 5);
const usage = { version: "1.2.3", generated_at: "x", suspended: false, coaches_active: 1, members_active: 4, requests_this_month: 3, requests_overdue: 0, last_activity_at: null };
const calls: string[] = [];
const fetchers: Fetchers = {
  health: async (u) => { calls.push(u.origin); return { ok: true, status: 200, latencyMs: 12 }; },
  usage: async (u, key) => { calls.push(`${u.origin}|${key}`); return key === "cle-a" ? usage : null; },
};
const deps = (db: Parameters<typeof runHealthChecks>[1]["db"]) => ({ db, masterKey, instanceDomain: "mentora.app", fetchers });

async function seed(db: Parameters<typeof runHealthChecks>[1]["db"]) {
  const [a] = await db.insert(client).values({ name: "A", instanceHost: "a", status: "ACTIF", keyEncrypted: encryptSecret("cle-a", masterKey) }).returning();
  const [b] = await db.insert(client).values({ name: "B", instanceHost: "b", status: "RESILIE", keyEncrypted: encryptSecret("cle-b", masterKey) }).returning();
  const [c] = await db.insert(client).values({ name: "C", instanceHost: "c", status: "ESSAI", keyEncrypted: encryptSecret("cle-mauvaise", masterKey) }).returning();
  return { a: a!, b: b!, c: c! };
}

describe("supervision", () => {
  it("contrôle la santé des clients non résiliés et purge au-delà de 30 jours", async () => {
    await withTestDb(async (db) => {
      const { a } = await seed(db);
      const now = new Date("2027-02-20T10:00:00Z");
      await db.insert(healthCheck).values({ clientId: a.id, checkedAt: new Date("2027-01-01T00:00:00Z"), ok: true, latencyMs: 5 });
      calls.length = 0;
      await runHealthChecks(now, deps(db));
      expect(calls.sort()).toEqual(["https://a.mentora.app", "https://c.mentora.app"]);
      const rows = await db.select().from(healthCheck);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.checkedAt > new Date("2027-01-21T00:00:00Z"))).toBe(true);
    });
  });

  it("ne contacte jamais une adresse invalide", async () => {
    await withTestDb(async (db) => {
      await db.insert(client).values({ name: "X", instanceHost: "a.b", status: "ACTIF" });
      calls.length = 0;
      await runHealthChecks(new Date(), deps(db));
      expect(calls).toEqual([]);
    });
  });

  it("relève l'usage une fois par jour et par client, sans doublon, et rattrape un jour manqué", async () => {
    await withTestDb(async (db) => {
      const { a, c } = await seed(db);
      const now = new Date("2027-02-20T10:00:00Z");
      await runUsageSnapshots(now, deps(db));
      await runUsageSnapshots(now, deps(db));
      const snaps = await db.select().from(usageSnapshot).where(eq(usageSnapshot.clientId, a.id));
      expect(snaps).toHaveLength(1);
      expect(snaps[0]).toMatchObject({ day: "2027-02-20" });
      expect(snaps[0]!.counters).toMatchObject({ members_active: 4, version: "1.2.3" });
      // Clé refusée par l'instance : aucun relevé, pas d'erreur.
      expect(await db.select().from(usageSnapshot).where(eq(usageSnapshot.clientId, c.id))).toHaveLength(0);
      // Lendemain : un seul nouveau relevé.
      await runUsageSnapshots(new Date("2027-02-21T00:05:00Z"), deps(db));
      expect(await db.select().from(usageSnapshot).where(eq(usageSnapshot.clientId, a.id))).toHaveLength(2);
    });
  });

  it("purge les relevés de plus de 400 jours", async () => {
    await withTestDb(async (db) => {
      const { a } = await seed(db);
      await db.insert(usageSnapshot).values({ clientId: a.id, day: "2025-01-01", counters: {} });
      await runUsageSnapshots(new Date("2027-02-20T10:00:00Z"), deps(db));
      expect((await db.select().from(usageSnapshot).where(eq(usageSnapshot.clientId, a.id))).map((s) => s.day)).toEqual(["2027-02-20"]);
    });
  });

  it("une clé illisible n'interrompt pas les autres clients", async () => {
    await withTestDb(async (db) => {
      await db.insert(client).values({ name: "Z", instanceHost: "z", status: "ACTIF", keyEncrypted: "v1.corrompu.corrompu.corrompu" });
      const { a } = await seed(db);
      await runUsageSnapshots(new Date("2027-02-20T10:00:00Z"), deps(db));
      expect(await db.select().from(usageSnapshot).where(eq(usageSnapshot.clientId, a.id))).toHaveLength(1);
    });
  });
});
