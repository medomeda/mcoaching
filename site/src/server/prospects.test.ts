import { describe, expect, it } from "vitest";
import { withTestDb } from "@/test/db";
import { auditLog, client, prospect } from "@/db/schema";
import { prospectToClientDraft, setProspectStatus } from "./prospects";

const row = { name: "Awa Traoré", email: "awa@example.com", emailNormalized: "awa@example.com", phone: "+22507000000", activity: "Coaching", message: "Texte privé du prospect", consent: true };

describe("prospects", () => {
  it("journalise les changements de statut", async () => {
    await withTestDb(async (db) => {
      const [p] = await db.insert(prospect).values(row).returning();
      await setProspectStatus(p!.id, "CONTACTE", db);
      await setProspectStatus(p!.id, "PERDU", db);
      const [after] = await db.select().from(prospect);
      expect(after!.status).toBe("PERDU");
      expect((await db.select().from(auditLog)).map((a) => a.action)).toEqual(["PROSPECT_STATUS", "PROSPECT_STATUS"]);
    });
  });

  it("le brouillon de client reprend les coordonnées sans le message", async () => {
    await withTestDb(async (db) => {
      const [p] = await db.insert(prospect).values(row).returning();
      const draft = await prospectToClientDraft(p!.id, db);
      expect(draft).toEqual({ prospectId: p!.id, name: "Awa Traoré", contactName: "Awa Traoré", contactEmail: "awa@example.com", contactPhone: "+22507000000" });
      expect(JSON.stringify(draft)).not.toContain("Texte privé");
    });
  });

  it("CONVERTI ne se choisit pas à la main et ne se convertit pas deux fois", async () => {
    await withTestDb(async (db) => {
      const [p] = await db.insert(prospect).values(row).returning();
      await expect(setProspectStatus(p!.id, "CONVERTI", db)).rejects.toThrow(/conversion/i);
      const [c] = await db.insert(client).values({ name: "Awa" }).returning();
      await db.update(prospect).set({ status: "CONVERTI", clientId: c!.id });
      await expect(prospectToClientDraft(p!.id, db)).rejects.toThrow(/déjà converti/i);
      await expect(setProspectStatus(p!.id, "NOUVEAU", db)).rejects.toThrow(/déjà converti/i);
    });
  });
});
