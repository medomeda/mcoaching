import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withTestDb } from "@/test/db";
import { client, payment, plan, prospect } from "@/db/schema";
import { decryptSecret } from "@/lib/secret-box";
import { changePlan, createClient, getClientView, recordPayment, rotateInstanceKey, setClientStatus } from "./clients";

const masterKey = Buffer.alloc(32, 9);
const input = { name: "Cabinet Awa", contactName: "Awa", contactEmail: "awa@example.com", instanceHost: "awa" };

describe("clients", () => {
  it("crée un client, renvoie la clé une seule fois et ne la stocke jamais en clair", async () => {
    await withTestDb(async (db) => {
      const r = await createClient(input, { db, masterKey });
      expect(Buffer.from(r.instanceKey, "base64url")).toHaveLength(32);
      const [row] = await db.select().from(client);
      expect(row!.keyEncrypted).toBeTruthy();
      expect(row!.keyEncrypted).not.toContain(r.instanceKey);
      expect(decryptSecret(row!.keyEncrypted!, masterKey)).toBe(r.instanceKey);
      const view = await getClientView(r.client.id, db);
      expect(JSON.stringify(view)).not.toContain("keyEncrypted");
      expect(JSON.stringify(view)).not.toContain(r.instanceKey);
      expect(view!.hasKey).toBe(true);
    });
  });

  it("calcule la fin d'essai à partir de la formule", async () => {
    await withTestDb(async (db) => {
      const [p] = await db.insert(plan).values({ slug: "solo", name: "Solo", trialDays: 14 }).returning();
      const r = await createClient({ ...input, planId: p!.id }, { db, masterKey, now: new Date("2027-01-10T10:00:00Z") });
      expect(r.client.status).toBe("ESSAI");
      expect(r.client.trialEndsOn).toBe("2027-01-24");
    });
  });

  it("refuse un sous-domaine invalide ou déjà pris", async () => {
    await withTestDb(async (db) => {
      for (const bad of ["Awa", "a.b", "-x", "x y", "", "a@b"]) await expect(createClient({ ...input, instanceHost: bad }, { db, masterKey }), bad).rejects.toThrow();
      await createClient(input, { db, masterKey });
      await expect(createClient({ ...input, name: "Autre" }, { db, masterKey })).rejects.toThrow();
    });
  });

  it("la conversion d'un prospect le marque converti et lie le client", async () => {
    await withTestDb(async (db) => {
      const [p] = await db.insert(prospect).values({ name: "Awa", email: "a@x.io", emailNormalized: "a@x.io", consent: true }).returning();
      const r = await createClient({ ...input, prospectId: p!.id }, { db, masterKey });
      const [after] = await db.select().from(prospect).where(eq(prospect.id, p!.id));
      expect(after).toMatchObject({ status: "CONVERTI", clientId: r.client.id });
      await expect(createClient({ ...input, instanceHost: "autre", prospectId: p!.id }, { db, masterKey })).rejects.toThrow(/déjà converti/i);
    });
  });

  it("un paiement avance l'échéance d'une période depuis la plus tardive des dates", async () => {
    await withTestDb(async (db) => {
      const r = await createClient({ ...input, billingPeriod: "MONTHLY" }, { db, masterKey });
      let c = await recordPayment(r.client.id, { paidOn: "2027-01-31", amount: 10000, method: "Mobile money" }, db);
      expect(c.nextDueOn).toBe("2027-02-28");
      c = await recordPayment(r.client.id, { paidOn: "2027-02-01", amount: 10000, method: "Mobile money" }, db);
      expect(c.nextDueOn).toBe("2027-03-28");
      expect(await db.select().from(payment)).toHaveLength(2);
    });
  });

  it("refuse un paiement non positif ou une date invalide", async () => {
    await withTestDb(async (db) => {
      const r = await createClient(input, { db, masterKey });
      await expect(recordPayment(r.client.id, { paidOn: "2027-01-31", amount: 0, method: "" }, db)).rejects.toThrow();
      await expect(recordPayment(r.client.id, { paidOn: "31/01/2027", amount: 100, method: "" }, db)).rejects.toThrow();
    });
  });

  it("change de formule, de statut et régénère la clé (ancienne clé invalidée)", async () => {
    await withTestDb(async (db) => {
      const [p] = await db.insert(plan).values({ slug: "pro", name: "Pro" }).returning();
      const r = await createClient(input, { db, masterKey });
      await changePlan(r.client.id, p!.id, "ANNUAL", db);
      await setClientStatus(r.client.id, "ACTIF", db);
      const [row] = await db.select().from(client);
      expect(row).toMatchObject({ planId: p!.id, billingPeriod: "ANNUAL", status: "ACTIF" });
      const k2 = await rotateInstanceKey(r.client.id, { db, masterKey });
      expect(k2).not.toBe(r.instanceKey);
      const [row2] = await db.select().from(client);
      expect(decryptSecret(row2!.keyEncrypted!, masterKey)).toBe(k2);
    });
  });
});
