/**
 * Contexte d'un appel serveur (PostgreSQL) : même rôle que `api/context.ts` pour la simulation.
 * La session vient du cookie BetterAuth ; le compte est relu en base à chaque appel, de sorte
 * qu'une suspension ou un changement de rôle prend effet immédiatement.
 */
import { eq } from "drizzle-orm";
import { AppError } from "@/modules/core/errors";
import type { Role } from "@/modules/core/types";
import type { Actor } from "@/modules/permissions/policies";
import { auth } from "../auth";
import { db } from "../pg/client";
import { user } from "../pg/schema";
import { toPublicUser, type UserRowDb } from "./helpers";

export interface LiveCall {
  headers: Headers;
}

export interface LiveAuthed {
  user: UserRowDb;
  actor: Actor;
  sessionId: string;
}

export async function authenticate(call: LiveCall, ...roles: Role[]): Promise<LiveAuthed> {
  const s = await auth.api.getSession({ headers: call.headers });
  if (!s) throw new AppError("UNAUTHENTICATED", "Veuillez vous connecter.");
  const [u] = await db.select().from(user).where(eq(user.id, s.user.id));
  if (!u || u.status !== "ACTIVE") {
    throw new AppError("UNAUTHENTICATED", "Votre compte n’est pas actif. Contactez l’administrateur.");
  }
  if (roles.length > 0 && !roles.includes(u.role)) {
    throw new AppError("FORBIDDEN", "Cet espace n’est pas accessible avec votre rôle.");
  }
  return { user: u, actor: { id: u.id, role: u.role, status: u.status }, sessionId: s.session.id };
}

export async function me(call: LiveCall) {
  return toPublicUser((await authenticate(call)).user);
}
