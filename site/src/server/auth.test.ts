import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { withTestDb } from "@/test/db";
import { user } from "@/db/schema";
import { createAuth, MAX_LOGIN_FAILURES, requireOperator } from "./auth";
import { createOperator } from "./operator";

const BASE = "http://admin.test";
const PASSWORD = "Un-mot-de-passe-solide-42";
const mk = (db: Parameters<typeof createAuth>[0]) => createAuth(db, { baseURL: BASE, secret: "x".repeat(40) });

async function cookieFor(a: ReturnType<typeof mk>, email: string, password = PASSWORD) {
  const res = await a.api.signInEmail({ body: { email, password }, asResponse: true });
  return new Headers({ cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
}

describe("authentification de l'opérateur", () => {
  it("sans session : refusé", async () => {
    await withTestDb(async (db) => {
      await expect(requireOperator(new Headers(), mk(db))).rejects.toThrow();
    });
  });

  it("session sans second facteur activé : refusé ; avec second facteur : accepté", async () => {
    await withTestDb(async (db) => {
      const a = mk(db);
      await createOperator(a, db, { email: "op@mentora.app", password: PASSWORD });
      const h = await cookieFor(a, "op@mentora.app");
      await expect(requireOperator(h, a)).rejects.toThrow(/double authentification/i);
      await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.email, "op@mentora.app"));
      await expect(requireOperator(h, a)).resolves.toMatchObject({ userId: expect.any(String) });
    });
  });

  it("l'activation du second facteur renvoie 10 codes de secours et une adresse TOTP", async () => {
    await withTestDb(async (db) => {
      const a = mk(db);
      await createOperator(a, db, { email: "op@mentora.app", password: PASSWORD });
      const h = await cookieFor(a, "op@mentora.app");
      const r = await a.api.enableTwoFactor({ body: { password: PASSWORD }, headers: h });
      if (!("totpURI" in r)) throw new Error("méthode TOTP attendue");
      expect(r.backupCodes).toHaveLength(10);
      expect(r.totpURI).toMatch(/^otpauth:\/\/totp\//);
    });
  });

  it("aucune inscription publique", async () => {
    await withTestDb(async (db) => {
      const a = mk(db);
      const res = await a.handler(
        new Request(`${BASE}/api/admin/auth/sign-up/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: BASE },
          body: JSON.stringify({ email: "intrus@example.com", password: PASSWORD, name: "Intrus" }),
        }),
      );
      expect(res.ok).toBe(false);
      expect(await db.select().from(user)).toHaveLength(0);
    });
  });

  it("verrouille l'adresse après des échecs répétés, même avec le bon mot de passe", async () => {
    await withTestDb(async (db) => {
      const a = mk(db);
      await createOperator(a, db, { email: "op@mentora.app", password: PASSWORD });
      for (let i = 0; i < MAX_LOGIN_FAILURES; i++) await a.api.signInEmail({ body: { email: "op@mentora.app", password: "mauvais-mot-de-passe" } }).catch(() => undefined);
      await expect(a.api.signInEmail({ body: { email: "op@mentora.app", password: PASSWORD } })).rejects.toThrow(/tentatives/i);
    });
  });

  it("un seul compte opérateur : le second est refusé", async () => {
    await withTestDb(async (db) => {
      const a = mk(db);
      await createOperator(a, db, { email: "op@mentora.app", password: PASSWORD });
      await expect(createOperator(a, db, { email: "autre@mentora.app", password: PASSWORD })).rejects.toThrow(/déjà/i);
    });
  });
});

describe("adminBaseUrl", () => {
  it("reprend le schéma de SITE_URL (http en local, https en production)", async () => {
    const { adminBaseUrl } = await import("./auth");
    expect(adminBaseUrl("admin.mentora.app", "https://mentora.app")).toBe("https://admin.mentora.app");
    expect(adminBaseUrl("admin.localtest.me:3601", "http://site.localtest.me:3601")).toBe("http://admin.localtest.me:3601");
    expect(adminBaseUrl("admin.mentora.app", undefined)).toBe("https://admin.mentora.app");
    expect(adminBaseUrl(undefined, "https://mentora.app")).toBeUndefined();
  });
});

describe("second facteur : verrouillage", () => {
  it("des échecs répétés du code TOTP verrouillent le compte, et une connexion par mot de passe seul ne remet pas le compteur à zéro", async () => {
    const { codeFromUri } = await import("@/test/totp");
    await withTestDb(async (db) => {
      const a = mk(db);
      await createOperator(a, db, { email: "op@mentora.app", password: PASSWORD });
      const h0 = await cookieFor(a, "op@mentora.app");
      const en = await a.api.enableTwoFactor({ body: { password: PASSWORD }, headers: h0 });
      if (!("totpURI" in en)) throw new Error("TOTP attendu");
      await a.api.verifyTOTP({ body: { code: await codeFromUri(en.totpURI) }, headers: h0 });
      let locked = false;
      for (let i = 0; i < MAX_LOGIN_FAILURES + 3 && !locked; i++) {
        const r = await a.api.signInEmail({ body: { email: "op@mentora.app", password: PASSWORD }, asResponse: true }).catch(() => null);
        if (!r) { locked = true; break; }
        const h = new Headers({ cookie: r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
        await a.api.verifyTOTP({ body: { code: "000000" }, headers: h }).catch((e: Error) => { if (/tentatives/i.test(e.message)) locked = true; });
      }
      expect(locked).toBe(true);
      // Même avec le bon code, tant que le verrou est actif.
      const r = await a.api.signInEmail({ body: { email: "op@mentora.app", password: PASSWORD } }).catch((e: Error) => e);
      expect(r instanceof Error && /tentatives/i.test(r.message)).toBe(true);
    });
  });
});

describe("double authentification désactivable en développement seulement", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("ADMIN_REQUIRE_2FA=false : une session sans second facteur est acceptée hors production", async () => {
    await withTestDb(async (db) => {
      const a = mk(db);
      await createOperator(a, db, { email: "op@mentora.app", password: PASSWORD });
      const h = await cookieFor(a, "op@mentora.app");
      await expect(requireOperator(h, a)).rejects.toThrow(/double authentification/i);
      vi.stubEnv("ADMIN_REQUIRE_2FA", "false");
      await expect(requireOperator(h, a)).resolves.toMatchObject({ userId: expect.any(String) });
    });
  });

  it("en production, le second facteur reste obligatoire même si la variable est à false", async () => {
    await withTestDb(async (db) => {
      const a = mk(db);
      await createOperator(a, db, { email: "op@mentora.app", password: PASSWORD });
      const h = await cookieFor(a, "op@mentora.app");
      vi.stubEnv("ADMIN_REQUIRE_2FA", "false");
      vi.stubEnv("NODE_ENV", "production");
      await expect(requireOperator(h, a)).rejects.toThrow(/double authentification/i);
    });
  });
});
