import { eq } from "drizzle-orm";
import type { SiteDb } from "@/db/client";
import { twoFactor, user } from "@/db/schema";
import type { OperatorAuth } from "./auth";

/** Crée l'unique compte opérateur (refuse s'il en existe déjà un). Aucune inscription publique n'existe. */
export async function createOperator(auth: OperatorAuth, db: SiteDb, input: { email: string; password: string; name?: string }) {
  const existing = await db.select({ id: user.id }).from(user).limit(1);
  if (existing.length > 0) throw new Error("Un compte opérateur existe déjà : un seul compte est autorisé.");
  if (input.password.length < 12) throw new Error("Le mot de passe doit contenir au moins 12 caractères.");
  const ctx = await auth.$context;
  const created = await ctx.internalAdapter.createUser({ email: input.email.trim().toLowerCase(), name: input.name ?? "Opérateur", emailVerified: true }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({ userId: created.id, providerId: "credential", accountId: created.id, password: await ctx.password.hash(input.password) });
  return created.id;
}

/** Réinitialise le second facteur (perte de l'appareil) ; à exécuter sur le serveur. */
export async function resetTwoFactor(db: SiteDb, email: string) {
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email.trim().toLowerCase()));
  if (!u) throw new Error("Aucun compte avec cette adresse.");
  await db.delete(twoFactor).where(eq(twoFactor.userId, u.id));
  await db.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, u.id));
}
