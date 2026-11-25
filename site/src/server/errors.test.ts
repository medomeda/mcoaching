import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withTestDb } from "@/test/db";
import { createClient } from "./clients";
import { safeLogMessage, userMessage } from "./errors";

const masterKey = Buffer.alloc(32, 9);

describe("userMessage", () => {
  it("sous-domaine déjà pris : message clair, sans requête SQL ni donnée chiffrée", async () => {
    await withTestDb(async (db) => {
      const input = { name: "A", instanceHost: "awa" };
      await createClient(input, { db, masterKey });
      const err = (await createClient({ ...input, name: "B" }, { db, masterKey }).then(() => null, (e: unknown) => e)) as Error;
      expect(err.message).toMatch(/Failed query/); // le message brut contient bien la requête et le jeton chiffré
      const msg = userMessage(err);
      expect(msg).toMatch(/déjà utilisé/i);
      expect(msg).not.toMatch(/Failed query|insert|v1\./);
    });
  });
  it("erreur de validation : premier message lisible", () => {
    const r = z.object({ n: z.string().min(2, "Trop court.") }).safeParse({ n: "a" });
    expect(userMessage(r.success ? null : r.error)).toBe("Trop court.");
  });
  it("erreur métier simple : message conservé ; inconnu : message générique", () => {
    expect(userMessage(new Error("Prospect introuvable."))).toBe("Prospect introuvable.");
    expect(userMessage("bizarre")).toMatch(/impossible/i);
  });
  it("les journaux ne reçoivent jamais le message brut (données personnelles)", () => {
    const e = Object.assign(new Error('Failed query: insert into "prospect" params: Awa,awa@example.com'), { name: "DrizzleQueryError" });
    expect(safeLogMessage(e)).not.toContain("awa@example.com");
  });
});
