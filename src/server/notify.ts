/**
 * Création des notifications (PRD §7.4, §9.11), à appeler DANS une transaction métier.
 * - Anti-doublon : une clé d'événement unique par destinataire (`notification_events`).
 * - Chaque notification in-app entraîne un e-mail mis en file (PENDING) : l'envoi est réalisé
 *   par la tâche planifiée ; un échec n'annule jamais l'opération métier déjà enregistrée.
 */
import type { Database, NotificationType, Role, User } from "@/modules/core/types";
import { newId } from "./crypto";

export interface NotifyInput {
  recipients: User[];
  type: NotificationType;
  title: string;
  /** Résumé non confidentiel (jamais le contenu d'un message). */
  summary: string;
  requestId?: string | null;
  /** Clé d'événement métier, ex. `REMINDER_50:<requestId>:<cycle>`. */
  eventKey: string;
  email?: boolean;
}

const spaceOf = (role: Role) => (role === "ADMIN" ? "admin" : role === "COACH" ? "coach" : "learner");

export function requestPath(role: Role, requestId: string): string {
  return `/${spaceOf(role)}/requests/${requestId}`;
}

export function notify(db: Database, now: Date, input: NotifyInput): number {
  const iso = now.toISOString();
  let created = 0;
  const seen = new Set<string>();
  for (const user of input.recipients) {
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    const key = `${input.eventKey}:${user.id}`;
    if (db.notification_events.some((e) => e.key === key)) continue;
    db.notification_events.push({ key, created_at: iso });
    const notifId = newId("ntf");
    db.notifications.push({
      id: notifId,
      user_id: user.id,
      type: input.type,
      title: input.title,
      body: input.summary,
      related_request_id: input.requestId ?? null,
      event_key: input.eventKey,
      read_at: null,
      created_at: iso,
    });
    created++;
    if (input.email !== false && user.status !== "SUSPENDED") {
      db.email_delivery_logs.push({
        id: newId("eml"),
        notification_id: notifId,
        recipient: user.email,
        template_key: "NOTIFICATION",
        template_params: {
          name: user.full_name,
          title: input.title,
          summary: input.summary,
          link: input.requestId ? requestPath(user.role, input.requestId) : `/${spaceOf(user.role)}/notifications`,
        },
        status: "PENDING",
        attempt_count: 0,
        last_attempt_at: null,
        next_attempt_at: iso,
        sent_at: null,
        error_code: null,
        created_at: iso,
      });
    }
  }
  return created;
}

/** E-mail transactionnel hors notification (activation, réinitialisation). */
export function queueTransactionalEmail(
  db: Database,
  now: Date,
  user: User,
  template: "ACCOUNT_ACTIVATION" | "PASSWORD_RESET",
  link: string,
): void {
  const iso = now.toISOString();
  db.email_delivery_logs.push({
    id: newId("eml"),
    notification_id: null,
    recipient: user.email,
    template_key: template,
    template_params: { name: user.full_name, link },
    status: "PENDING",
    attempt_count: 0,
    last_attempt_at: null,
    next_attempt_at: iso,
    sent_at: null,
    error_code: null,
    created_at: iso,
  });
}

export function activeAdmins(db: Database): User[] {
  return db.users.filter((u) => u.role === "ADMIN" && u.status === "ACTIVE");
}
