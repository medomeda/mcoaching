/**
 * Contexte d'un appel d'API simulé : authentification de la session, contrôle du statut
 * du compte, validation des entrées, rattrapage des tâches planifiées.
 */
import { AppError } from "@/modules/core/errors";
export { parse, zReason, zText } from "@/modules/core/validation";
import type { Database, Role, Session, User } from "@/modules/core/types";
import type { Actor } from "@/modules/permissions/policies";
import { sha256 } from "../crypto";
import { getRuntime } from "../runtime";
import { runScheduledJobs } from "../jobs/scheduler";

export const SESSION_IDLE_MINUTES = 120;
export const SESSION_MAX_HOURS = 12;

export interface Call {
  token: string | null;
}

export interface Authed {
  user: User;
  actor: Actor;
  session: Session;
}

export function store() {
  return getRuntime().store;
}

export function files() {
  return getRuntime().files;
}

/**
 * Recherche la session et l'utilisateur (sans écriture).
 * Les mécanismes de SÉCURITÉ (sessions, jetons, verrouillage) utilisent l'heure réelle :
 * l'horloge de démonstration ne simule que le temps métier (délais, rappels, escalades).
 */
export async function resolveSession(db: Database, token: string | null, now: Date) {
  if (!token) throw new AppError("UNAUTHENTICATED", "Veuillez vous connecter.");
  const hash = await sha256(token);
  const session = db.sessions.find((s) => s.token_hash === hash);
  if (!session || session.revoked_at) throw new AppError("UNAUTHENTICATED", "Veuillez vous connecter.");
  const idleLimit = new Date(session.last_seen_at).getTime() + SESSION_IDLE_MINUTES * 60_000;
  if (now.getTime() > new Date(session.expires_at).getTime() || now.getTime() > idleLimit) {
    throw new AppError("SESSION_EXPIRED", "Votre session a expiré. Veuillez vous reconnecter.");
  }
  const user = db.users.find((u) => u.id === session.user_id);
  if (!user || user.status !== "ACTIVE") {
    throw new AppError("UNAUTHENTICATED", "Votre compte n’est pas actif. Contactez l’administrateur.");
  }
  return { session, user };
}

let lastJobRun = 0;
const JOB_CATCH_UP_MS = 15_000;

/**
 * Rattrapage des tâches planifiées. Dans la simulation, il n'existe pas de worker serveur :
 * les traitements (purs et idempotents) sont rejoués au plus toutes les 15 s, quel que soit
 * l'utilisateur connecté. En production, un worker les exécutera indépendamment du navigateur.
 */
export async function catchUpJobs(force = false): Promise<void> {
  const real = Date.now();
  if (!force && real - lastJobRun < JOB_CATCH_UP_MS) return;
  lastJobRun = real;
  await store().transaction((db, now) => runScheduledJobs(db, now));
}

export function resetJobThrottle() {
  lastJobRun = 0;
}

/** Authentifie l'appel et vérifie le rôle. Met à jour l'activité de session (au plus 1×/min). */
export async function authenticate(call: Call, ...roles: Role[]): Promise<Authed> {
  await catchUpJobs();
  const s = store();
  const db = s.snapshot();
  const now = s.realNow();
  const { session, user } = await resolveSession(db, call.token, now);
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new AppError("FORBIDDEN", "Cet espace n’est pas accessible avec votre rôle.");
  }
  if (now.getTime() - new Date(session.last_seen_at).getTime() > 60_000) {
    await s.transaction((d) => {
      const sess = d.sessions.find((x) => x.id === session.id);
      if (sess) sess.last_seen_at = s.realNow().toISOString();
    });
  }
  return { user, actor: { id: user.id, role: user.role, status: user.status }, session };
}

/** Revérification DANS la transaction : le compte peut avoir été suspendu entre-temps. */
export function reauth(db: Database, a: Authed): User {
  const u = db.users.find((x) => x.id === a.user.id);
  if (!u || u.status !== "ACTIVE" || u.role !== a.user.role) {
    throw new AppError("UNAUTHENTICATED", "Votre compte n’est plus actif ou votre rôle a changé.");
  }
  return u;
}
