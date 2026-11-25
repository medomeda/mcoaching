import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { withTestDb } from "@/test/db";
import { user } from "@/db/schema";
import { createAuth, requireOperator } from "@/server/auth";
import { createOperator } from "@/server/operator";
import { codeFromUri } from "./totp";

describe("assistant de test TOTP", () => {
  it("un code calculé depuis l'adresse otpauth active le second facteur et permet de se connecter", async () => {
    await withTestDb(async (db) => {
      const a = createAuth(db, { baseURL: "http://admin.test", secret: "y".repeat(40) });
      await createOperator(a, db, { email: "op@mentora.app", password: "Un-mot-de-passe-solide-42" });
      const r1 = await a.api.signInEmail({ body: { email: "op@mentora.app", password: "Un-mot-de-passe-solide-42" }, asResponse: true });
      const h = new Headers({ cookie: r1.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
      const en = await a.api.enableTwoFactor({ body: { password: "Un-mot-de-passe-solide-42" }, headers: h });
      if (!("totpURI" in en)) throw new Error("TOTP attendu");
      const v = await a.api.verifyTOTP({ body: { code: await codeFromUri(en.totpURI) }, headers: h, asResponse: true });
      expect(v.ok).toBe(true);
      const [u] = await db.select().from(user).where(eq(user.email, "op@mentora.app"));
      expect(u!.twoFactorEnabled).toBe(true);
      // Nouvelle connexion : second facteur exigé puis accepté.
      const r2 = await a.api.signInEmail({ body: { email: "op@mentora.app", password: "Un-mot-de-passe-solide-42" }, asResponse: true });
      expect((await r2.clone().json()).twoFactorRedirect).toBe(true);
      const h2 = new Headers({ cookie: r2.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
      const v2 = await a.api.verifyTOTP({ body: { code: await codeFromUri(en.totpURI) }, headers: h2, asResponse: true });
      expect(v2.ok).toBe(true);
      const h3 = new Headers({ cookie: v2.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") });
      await expect(requireOperator(h3, a)).resolves.toMatchObject({ userId: expect.any(String) });
    });
  });
});
