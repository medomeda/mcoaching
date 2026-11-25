/** Chiffrement des clés d'instance : AES-256-GCM, jeton `v1.<iv>.<tag>.<données>` en base64url. */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function loadMasterKey(value = process.env.MASTER_KEY): Buffer {
  if (!value) throw new Error("MASTER_KEY est manquante (32 octets en base64 : openssl rand -base64 32).");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("MASTER_KEY doit contenir 32 octets (base64).");
  return key;
}

export function encryptSecret(plain: string, masterKey: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(token: string, masterKey: Buffer): string {
  const [version, iv, tag, data] = token.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Jeton chiffré invalide.");
  const decipher = createDecipheriv("aes-256-gcm", masterKey, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Clé d'accès d'une instance : 32 octets aléatoires. */
export const generateInstanceKey = (): string => randomBytes(32).toString("base64url");
