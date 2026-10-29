/** Lectures et écritures élémentaires partagées par les modules serveur (PostgreSQL). */
import { and, eq, ilike, inArray, like, or, type SQL } from "drizzle-orm";
import { notFound } from "@/modules/core/errors";
import { REQUEST_STATUSES, type AuditLog, type NotificationType } from "@/modules/core/types";
import { isOpen } from "@/modules/requests/stateMachine";
import type { PublicUser } from "../api/auth";
import { newId, randomToken, sha256 } from "../crypto";
import { renderEmail } from "../mail/templates";
import { sendEmail } from "../mail/sender";
import { db, type Db } from "../pg/client";
import { auditLog, emailDeliveryLog, notification, notificationEvent, user, verification } from "../pg/schema";
import { appUrl } from "../appUrl";

/** Transaction Drizzle ou client direct : les helpers acceptent les deux. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;
export type UserRowDb = typeof user.$inferSelect;

export const ACTIVATION_TTL_HOURS = 72;
export const OPEN_STATUSES = REQUEST_STATUSES.filter(isOpen);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Pagination : même forme de réponse que `paginate` (simulation). */
export function pageOf(total: number, page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return { page: Math.min(Math.max(1, page), pages), pages };
}

/** Recherche « contient » sur le nom ou l'e-mail, caractères LIKE échappés. */
export function userSearch(q: string | undefined): SQL | undefined {
  if (!q) return undefined;
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return or(ilike(user.name, pattern), ilike(user.email, pattern));
}

export async function namesOf(tx: Tx, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (wanted.length === 0) return new Map();
  const rows = await tx.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, wanted));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export const nameIn = (names: Map<string, string>, id: string | null) =>
  !id ? "Système" : (names.get(id) ?? "Utilisateur inconnu");

export function toPublicUser(u: UserRowDb): PublicUser {
  return {
    id: u.id,
    full_name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    last_login_at: iso(u.lastLoginAt),
    created_at: u.createdAt.toISOString(),
  };
}

export async function getUser(tx: Tx, id: string, opts: { forUpdate?: boolean } = {}): Promise<UserRowDb> {
  const q = tx.select().from(user).where(eq(user.id, id));
  const [u] = await (opts.forUpdate ? q.for("update") : q);
  if (!u) throw notFound("Utilisateur introuvable.");
  return u;
}

export async function activeAdmins(tx: Tx): Promise<UserRowDb[]> {
  return tx.select().from(user).where(and(eq(user.role, "ADMIN"), eq(user.status, "ACTIVE")));
}

export async function audit(
  tx: Tx,
  entry: Omit<AuditLog, "id" | "created_at" | "metadata"> & { metadata?: Record<string, unknown> },
): Promise<void> {
  await tx.insert(auditLog).values({
    id: newId("aud"),
    actorId: entry.actor_id,
    action: entry.action,
    entityType: entry.entity_type,
    entityId: entry.entity_id,
    reason: entry.reason,
    metadata: entry.metadata ?? {},
  });
}

const spaceOf = (role: UserRowDb["role"]) => (role === "ADMIN" ? "admin" : role === "COACH" ? "coach" : "learner");

/** Lien de l'application vers une demande, selon l'espace du destinataire. */
export function requestPath(role: UserRowDb["role"], requestId: string): string {
  return `/${spaceOf(role)}/requests/${requestId}`;
}

/**
 * Notification (PRD §7.4, §9.11), à appeler DANS la transaction métier — même règle que `notify.ts` :
 * - anti-doublon : une clé d'événement unique par destinataire (`notification_event`) ;
 * - chaque notification met en file un e-mail (PENDING), envoyé par la tâche planifiée : un échec
 *   d'envoi n'annule jamais l'opération métier. Pas d'e-mail pour un compte suspendu.
 */
export async function notify(
  tx: Tx,
  input: {
    recipients: UserRowDb[];
    type: NotificationType;
    title: string;
    summary: string;
    eventKey: string;
    requestId?: string | null;
    email?: boolean;
  },
): Promise<number> {
  let created = 0;
  const now = new Date();
  for (const r of new Map(input.recipients.map((u) => [u.id, u])).values()) {
    const inserted = await tx
      .insert(notificationEvent)
      .values({ key: `${input.eventKey}:${r.id}` })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) continue;
    const notificationId = newId("ntf");
    await tx.insert(notification).values({
      id: notificationId,
      userId: r.id,
      type: input.type,
      title: input.title,
      body: input.summary,
      relatedRequestId: input.requestId ?? null,
      eventKey: input.eventKey,
      createdAt: now,
    });
    created++;
    if (input.email !== false && r.status !== "SUSPENDED") {
      await tx.insert(emailDeliveryLog).values({
        id: newId("eml"),
        notificationId,
        recipient: r.email,
        templateKey: "NOTIFICATION",
        // Paramètres non confidentiels : jamais le contenu d'un message privé.
        templateParams: {
          name: r.name,
          title: input.title,
          summary: input.summary,
          link: input.requestId ? requestPath(r.role, input.requestId) : `/${spaceOf(r.role)}/notifications`,
        },
        status: "PENDING",
        nextAttemptAt: now,
        createdAt: now,
      });
    }
  }
  return created;
}

/**
 * Jeton d'activation : seul son hash est stocké (table `verification` de BetterAuth),
 * les jetons précédents du même utilisateur sont invalidés. Renvoie le jeton en clair.
 */
export async function issueActivationToken(tx: Tx, userId: string): Promise<string> {
  const token = randomToken();
  await tx.delete(verification).where(and(eq(verification.value, userId), like(verification.identifier, "activation:%")));
  await tx.insert(verification).values({
    id: newId("ver"),
    identifier: await activationIdentifier(token),
    value: userId,
    expiresAt: new Date(Date.now() + ACTIVATION_TTL_HOURS * 3600_000),
  });
  return token;
}

export async function activationIdentifier(token: string) {
  return `activation:${await sha256(token)}`;
}

/**
 * E-mail transactionnel (activation, réinitialisation), envoyé immédiatement après validation
 * de la transaction. Le journal n'en conserve que le résultat, jamais le lien : il contient un
 * jeton. En cas d'échec, l'administrateur utilise « Renvoyer l'accès » (nouveau jeton).
 */
export async function sendTransactionalEmail(
  u: Pick<UserRowDb, "name" | "email">,
  template: "ACCOUNT_ACTIVATION" | "PASSWORD_RESET",
  link: string,
): Promise<void> {
  const now = new Date();
  const result = await sendEmail({ to: u.email, ...renderEmail(template, { name: u.name, link }) });
  await db
    .insert(emailDeliveryLog)
    .values({
      id: newId("eml"),
      recipient: u.email,
      templateKey: template,
      templateParams: { name: u.name },
      status: result.ok ? "SENT" : "FAILED",
      attemptCount: 1,
      lastAttemptAt: now,
      sentAt: result.ok ? now : null,
      errorCode: result.ok ? null : result.code,
      createdAt: now,
    })
    .catch((e) => console.error("Journalisation de l’e-mail impossible", e));
}

export async function sendActivationEmail(u: Pick<UserRowDb, "name" | "email">, token: string): Promise<void> {
  await sendTransactionalEmail(u, "ACCOUNT_ACTIVATION", `${appUrl()}/activate?token=${token}`);
}
