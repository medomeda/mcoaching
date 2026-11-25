import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, generateInstanceKey, loadMasterKey } from "./secret-box";

const key = Buffer.alloc(32, 3);

describe("secret-box", () => {
  it("chiffre puis déchiffre", () => {
    const token = encryptSecret("clé-secrète", key);
    expect(token.startsWith("v1.")).toBe(true);
    expect(token).not.toContain("clé-secrète");
    expect(decryptSecret(token, key)).toBe("clé-secrète");
  });
  it("deux chiffrements du même texte diffèrent (IV aléatoire)", () => {
    expect(encryptSecret("a", key)).not.toBe(encryptSecret("a", key));
  });
  it("un jeton altéré ou une mauvaise clé sont rejetés", () => {
    const token = encryptSecret("a", key);
    const parts = token.split(".");
    parts[3] = Buffer.from("zzzz").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret(token, Buffer.alloc(32, 4))).toThrow();
    expect(() => decryptSecret("n'importe quoi", key)).toThrow();
  });
  it("génère des clés d'instance de 32 octets, différentes à chaque fois", () => {
    const a = generateInstanceKey();
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(generateInstanceKey()).not.toBe(a);
  });
  it("exige une clé maître de 32 octets", () => {
    expect(() => loadMasterKey(undefined)).toThrow(/MASTER_KEY/);
    expect(() => loadMasterKey(Buffer.alloc(16).toString("base64"))).toThrow(/32/);
    expect(loadMasterKey(key.toString("base64"))).toHaveLength(32);
  });
});
