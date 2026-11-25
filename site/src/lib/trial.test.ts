import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withTestDb } from "@/test/db";
import { prospect } from "@/db/schema";
import { createRateLimiter } from "./rate-limit";
import { normalizeEmail, processTrial, zTrialRequest } from "./trial";

const valid = { name: "Awa Traoré", email: "Awa@Example.com", phone: "", activity: "Coaching de carrière", message: "", consent: "on", website: "" };
const open = () => createRateLimiter({ max: 100, windowMs: 1000 });

describe("zTrialRequest", () => {
  it("exige le consentement", () => {
    const r = zTrialRequest.safeParse({ ...valid, consent: undefined });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.flatten().fieldErrors.consent).toBeTruthy();
  });
  it("normalise l'e-mail", () => {
    expect(normalizeEmail("  Awa@Example.COM ")).toBe("awa@example.com");
  });
});

describe("processTrial", () => {
  it("enregistre un prospect NOUVEAU", async () => {
    await withTestDb(async (db) => {
      const r = await processTrial(db, valid, "1.1.1.1", open());
      expect(r).toEqual({ ok: true });
      const rows = await db.select().from(prospect);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: "NOUVEAU", emailNormalized: "awa@example.com", consent: true });
    });
  });
  it("honeypot rempli : réponse identique à un succès, aucune insertion", async () => {
    await withTestDb(async (db) => {
      const r = await processTrial(db, { ...valid, website: "http://spam" }, "1.1.1.1", open());
      expect(r).toEqual({ ok: true });
      expect(await db.select().from(prospect)).toHaveLength(0);
    });
  });
  it("même e-mail en casse différente : un seul prospect, message mis à jour, statut conservé", async () => {
    await withTestDb(async (db) => {
      await processTrial(db, valid, "1.1.1.1", open());
      await db.update(prospect).set({ status: "CONTACTE" });
      const r = await processTrial(db, { ...valid, email: "awa@example.COM", message: "Plus de détails" }, "1.1.1.1", open());
      expect(r).toEqual({ ok: true });
      const rows = await db.select().from(prospect).where(eq(prospect.emailNormalized, "awa@example.com"));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ message: "Plus de détails", status: "CONTACTE" });
    });
  });
  it("erreurs de champ sans insertion", async () => {
    await withTestDb(async (db) => {
      const r = await processTrial(db, { ...valid, consent: "", email: "pas-un-mail" }, "1.1.1.1", open());
      expect(r.ok).toBe(false);
      expect(!r.ok && Object.keys(r.fieldErrors).sort()).toEqual(["consent", "email"]);
      expect(await db.select().from(prospect)).toHaveLength(0);
    });
  });
  it("6e envoi dans la fenêtre depuis la même IP : refusé", async () => {
    await withTestDb(async (db) => {
      const limiter = createRateLimiter({ max: 5, windowMs: 3600_000 });
      for (let i = 0; i < 5; i++) await processTrial(db, { ...valid, email: `u${i}@example.com` }, "9.9.9.9", limiter);
      const r = await processTrial(db, { ...valid, email: "u6@example.com" }, "9.9.9.9", limiter);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.fieldErrors._form).toMatch(/trop/i);
      expect(await db.select().from(prospect)).toHaveLength(5);
    });
  });
});
