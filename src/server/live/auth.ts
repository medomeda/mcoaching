/**
 * Authentification côté serveur (PRD §9.1, §13.2), en complément des routes BetterAuth :
 * la connexion, la déconnexion et la demande de réinitialisation passent directement par
 * `/api/auth/*` (limitation de débit) ; ce module couvre le reste du contrat `api.auth`.
 */
import { APIError } from "better-auth/api";
import { count, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, businessRule, validation } from "@/modules/core/errors";
import { zPassword } from "@/modules/core/password";
import { parse, zEmail, zPhone, zText } from "@/modules/core/validation";
import { auth } from "../auth";
import { newId } from "../crypto";
import { db } from "../pg/client";
import { session, user, verification } from "../pg/schema";
import { authenticate, type LiveCall } from "./context";
import { activationByEmail, hashPassword, setCredentialPassword } from "./credentials";
import { activationIdentifier, audit, toPublicUser, type Tx } from "./helpers";

const INVALID_LINK = "Ce lien est invalide ou a expiré. Demandez un nouveau lien.";
const zPurpose = z.enum(["ACTIVATION", "PASSWORD_RESET"]);
const zToken = z.string().min(10).max(200);

export async function systemStatus(_call: LiveCall) {
  const n = (await db.select({ n: count() }).from(user))[0]?.n ?? 0;
  return { hasUsers: n > 0, demoSeeded: false, activationByEmail: activationByEmail(), now: new Date().toISOString() };
}

/** Création du premier administrateur, possible uniquement sur une base sans utilisateur. */
export async function bootstrapAdmin(_call: LiveCall, input: unknown) {
  const data = parse(z.object({ full_name: zText(2, 120, "Le nom"), email: zEmail, password: zPassword }), input);
  const hash = await hashPassword(data.password);
  await db.transaction(async (tx) => {
    // Sérialise les initialisations concurrentes.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('bootstrap_admin'))`);
    const n = (await tx.select({ n: count() }).from(user))[0]?.n ?? 0;
    if (n > 0) throw businessRule("La plateforme est déjà initialisée.");
    const id = newId("usr");
    await tx.insert(user).values({ id, name: data.full_name, email: data.email, emailVerified: true, role: "ADMIN", status: "ACTIVE" });
    await setCredentialPassword(tx, id, hash);
    await audit(tx, { actor_id: id, action: "BOOTSTRAP_ADMIN", entity_type: "user", entity_id: id, reason: null });
  });
}

async function findValidToken(tx: Tx, token: string, purpose: z.infer<typeof zPurpose>) {
  const identifier = purpose === "ACTIVATION" ? await activationIdentifier(token) : `reset-password:${token}`;
  const [v] = await tx.select().from(verification).where(eq(verification.identifier, identifier));
  if (!v || v.expiresAt.getTime() <= Date.now()) throw businessRule(INVALID_LINK);
  const [u] = await tx.select().from(user).where(eq(user.id, v.value));
  if (!u) throw businessRule(INVALID_LINK);
  return { v, u };
}

export async function inspectToken(_call: LiveCall, input: unknown) {
  const data = parse(z.object({ token: zToken, purpose: zPurpose }), input);
  const { u } = await findValidToken(db, data.token, data.purpose);
  return { full_name: u.name, email: u.email };
}

export async function completeToken(_call: LiveCall, input: unknown) {
  const data = parse(z.object({ token: zToken, purpose: zPurpose, password: zPassword }), input);

  if (data.purpose === "PASSWORD_RESET") {
    const { u } = await findValidToken(db, data.token, "PASSWORD_RESET");
    if (u.status === "SUSPENDED") throw businessRule("Ce compte est suspendu. Contactez l’administrateur.");
    try {
      // BetterAuth consomme le jeton et révoque les sessions (revokeSessionsOnPasswordReset).
      await auth.api.resetPassword({ body: { token: data.token, newPassword: data.password } });
    } catch (e) {
      if (e instanceof APIError) throw businessRule(INVALID_LINK);
      throw e;
    }
    await audit(db, { actor_id: u.id, action: "PASSWORD_RESET_COMPLETED", entity_type: "user", entity_id: u.id, reason: null });
    return;
  }

  const hash = await hashPassword(data.password);
  await db.transaction(async (tx) => {
    const { v, u } = await findValidToken(tx, data.token, "ACTIVATION");
    // Usage unique : la suppression du jeton échoue pour la seconde de deux requêtes concurrentes.
    const consumed = await tx.delete(verification).where(eq(verification.id, v.id)).returning();
    if (consumed.length === 0) throw businessRule(INVALID_LINK);
    if (u.status === "SUSPENDED") throw businessRule("Ce compte est suspendu. Contactez l’administrateur.");
    if (u.status !== "PENDING_ACTIVATION") throw businessRule("Ce compte est déjà activé.");
    await setCredentialPassword(tx, u.id, hash);
    await tx.delete(session).where(eq(session.userId, u.id));
    await tx.update(user).set({ status: "ACTIVE", emailVerified: true, updatedAt: new Date() }).where(eq(user.id, u.id));
    await audit(tx, { actor_id: u.id, action: "ACCOUNT_ACTIVATED", entity_type: "user", entity_id: u.id, reason: null });
  });
}

export async function changePassword(call: LiveCall, input: unknown) {
  const a = await authenticate(call);
  const data = parse(z.object({ current: z.string().min(1, "Mot de passe actuel requis."), next: zPassword }), input);
  try {
    // Les autres sessions sont révoquées, la session courante est conservée.
    await auth.api.changePassword({
      body: { currentPassword: data.current, newPassword: data.next, revokeOtherSessions: true },
      headers: call.headers,
    });
  } catch (e) {
    if (e instanceof APIError && e.body?.code === "INVALID_PASSWORD") {
      throw validation("Mot de passe actuel incorrect.", { current: "Mot de passe actuel incorrect." });
    }
    throw e;
  }
  await audit(db, { actor_id: a.user.id, action: "PASSWORD_CHANGED", entity_type: "user", entity_id: a.user.id, reason: null });
}

export async function updateMyProfile(call: LiveCall, input: unknown) {
  const a = await authenticate(call);
  const data = parse(z.object({ full_name: zText(2, 120, "Le nom"), phone: zPhone }), input);
  const [u] = await db
    .update(user)
    .set({ name: data.full_name, phone: data.phone ? data.phone : null, updatedAt: new Date() })
    .where(eq(user.id, a.user.id))
    .returning();
  return toPublicUser(u!);
}

/** Utilisé par la page « session expirée » : indique si la session est encore valide. */
export async function checkSession(call: LiveCall) {
  try {
    await authenticate(call);
    return { valid: true as const };
  } catch (e) {
    return { valid: false as const, reason: e instanceof AppError ? e.code : "UNAUTHENTICATED" };
  }
}

export { me } from "./context";
