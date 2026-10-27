/** Mots de passe des comptes : hachage BetterAuth, enregistrement, mot de passe provisoire. */
import { and, eq } from "drizzle-orm";
import { auth } from "../auth";
import { newId } from "../crypto";
import { account } from "../pg/schema";
import type { Tx } from "./helpers";

/**
 * Activation des comptes par e-mail (lien à usage unique). Désactivée par défaut tant qu'aucun
 * expéditeur n'est opérationnel : l'administrateur reçoit alors un mot de passe provisoire à transmettre.
 */
export const activationByEmail = () => process.env.ACTIVATION_BY_EMAIL === "true";

export async function hashPassword(password: string) {
  return (await auth.$context).password.hash(password);
}

/** Remplace le hash de mot de passe du compte « credential » (création si absent). */
export async function setCredentialPassword(tx: Tx, userId: string, hash: string) {
  await tx.delete(account).where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
  await tx.insert(account).values({ id: newId("acc"), accountId: userId, providerId: "credential", userId, password: hash });
}

// Sans caractères ambigus (0/O, 1/l/I) : le mot de passe est lu puis transmis à la main.
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";

/** Mot de passe provisoire conforme à la politique (≥ 10 caractères, lettre + chiffre), tiré avec crypto. */
export function generateTemporaryPassword(length = 12): string {
  const pick = (alphabet: string) => alphabet[crypto.getRandomValues(new Uint32Array(1))[0]! % alphabet.length]!;
  const chars = [pick(LETTERS), pick(DIGITS), ...Array.from({ length: length - 2 }, () => pick(LETTERS + DIGITS))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
