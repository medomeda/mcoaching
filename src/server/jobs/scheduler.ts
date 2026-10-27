/**
 * Tâches planifiées (PRD §7.4, §14). Fonction pure sur la base, idempotente :
 * rejouée plusieurs fois au même instant, elle ne produit aucun doublon
 * (clés d'événement uniques) et ne modifie jamais une échéance enregistrée.
 */
import type { Database, EmailDeliveryLog, JobRun } from "@/modules/core/types";
import { computeSla } from "@/modules/deadlines/sla";
import { isOpen } from "@/modules/requests/stateMachine";
import { newId } from "../crypto";
import { currentCycle, findUser, policyById } from "../db/helpers";
import { renderEmail } from "../mail/templates";
import { activeAdmins, notify } from "../notify";

/** Délais entre tentatives d'envoi (minutes calendaires). */
export const EMAIL_BACKOFF_MINUTES = [5, 15, 60, 240];

export interface JobsSummary {
  reminders: number;
  overdue: number;
  escalations: number;
  coachAlerts: number;
  emailsSent: number;
  emailsFailed: number;
  cleaned: number;
}

function markEvent(db: Database, key: string, iso: string) {
  if (!db.notification_events.some((e) => e.key === key)) db.notification_events.push({ key, created_at: iso });
}

function hasEvent(db: Database, prefix: string) {
  return db.notification_events.some((e) => e.key.startsWith(prefix));
}

export function processDeadlines(db: Database, now: Date, s: JobsSummary): void {
  const iso = now.toISOString();
  const admins = activeAdmins(db);
  for (const req of db.coaching_requests) {
    if (!isOpen(req.status)) continue;
    const cycle = currentCycle(db, req);
    if (!cycle || cycle.first_response_at) continue; // aucun rappel après une 1ʳᵉ réponse humaine
    const policy = policyById(db, cycle.policy_id);
    const sla = computeSla(cycle, req.status, policy, db.service_holidays, now);
    const coach = findUser(db, req.coach_id);
    const base = `${req.id}:${cycle.cycle_number}`;
    const ref = req.reference ?? "";

    // Étapes de rappel ; si plusieurs seuils sont franchis d'un coup, seule la plus avancée est envoyée.
    const stages: Array<{ key: string; reached: boolean; enabled: boolean; send: () => void }> = [
      {
        key: `REMINDER_50:${base}`,
        reached: sla.ratio >= 0.5,
        enabled: policy.reminder_50_enabled,
        send: () => {
          s.reminders += notify(db, now, {
            recipients: coach ? [coach] : [],
            type: "DEADLINE_REMINDER",
            title: `Rappel : ${ref} attend votre réponse`,
            summary: `La moitié du délai de première réponse est écoulée pour la demande ${ref}.`,
            requestId: req.id,
            eventKey: `REMINDER_50:${base}`,
          });
        },
      },
      {
        key: `REMINDER_75:${base}`,
        reached: sla.ratio >= 0.75,
        enabled: policy.reminder_75_enabled,
        send: () => {
          s.reminders += notify(db, now, {
            recipients: coach ? [coach] : [],
            type: "DEADLINE_REMINDER",
            title: `Second rappel : échéance proche pour ${ref}`,
            summary: `75 % du délai de première réponse est écoulé pour la demande ${ref}.`,
            requestId: req.id,
            eventKey: `REMINDER_75:${base}`,
          });
        },
      },
      {
        key: `OVERDUE:${base}`,
        reached: sla.isOverdue,
        enabled: true,
        send: () => {
          s.overdue += notify(db, now, {
            recipients: coach ? [coach] : [],
            type: "REQUEST_OVERDUE",
            title: `Demande en retard : ${ref}`,
            summary: `L’échéance de première réponse de la demande ${ref} est dépassée.`,
            requestId: req.id,
            eventKey: `OVERDUE:${base}`,
          });
        },
      },
    ];
    const reached = stages.filter((x) => x.reached);
    const top = reached[reached.length - 1];
    for (const st of reached) {
      if (hasEvent(db, `${st.key}:`) || db.notification_events.some((e) => e.key === st.key)) continue;
      if (st === top && st.enabled) st.send();
      markEvent(db, st.key, iso);
    }

    if (sla.isOverdue && sla.overdueMinutes >= policy.overdue_escalation_working_minutes) {
      const key = `ESCALATION:${base}`;
      if (!db.notification_events.some((e) => e.key === key)) {
        s.escalations += notify(db, now, {
          recipients: admins,
          type: "ESCALATION",
          title: `Escalade : ${ref} sans réponse`,
          summary: `La demande ${ref} (coach : ${coach?.full_name ?? "non affecté"}) dépasse son échéance de plus de ${Math.round(policy.overdue_escalation_working_minutes / 60)} h ouvrées.`,
          requestId: req.id,
          eventKey: key,
        });
        markEvent(db, key, iso);
      }
    }
  }
}

/** Alerte l'administrateur si un coach suspendu ou absent a des demandes nécessitant une action. */
export function processCoachAvailability(db: Database, now: Date, s: JobsSummary): void {
  const admins = activeAdmins(db);
  const t = now.getTime();
  for (const req of db.coaching_requests) {
    if (!isOpen(req.status) || req.status === "RESPONSE_PROVIDED" || req.status === "WAITING_FOR_LEARNER") continue;
    const coach = findUser(db, req.coach_id);
    if (!coach) continue;
    let reason: string | null = null;
    let key: string | null = null;
    if (coach.status === "SUSPENDED") {
      reason = "le coach responsable est suspendu";
      key = `COACH_SUSPENDED:${req.id}:${coach.id}`;
    } else {
      const absence = db.coach_absences.find(
        (a) => a.coach_id === coach.id && !a.cancelled_at && new Date(a.starts_at).getTime() <= t && new Date(a.ends_at).getTime() > t,
      );
      if (absence) {
        reason = "le coach responsable est absent";
        key = `COACH_ABSENT:${req.id}:${absence.id}`;
      }
    }
    if (!key || !reason) continue;
    s.coachAlerts += notify(db, now, {
      recipients: admins,
      type: "COACH_UNAVAILABLE",
      title: `Continuité de service : ${req.reference}`,
      summary: `La demande ${req.reference} nécessite une action alors que ${reason} (${coach.full_name}). Une réaffectation peut être nécessaire.`,
      requestId: req.id,
      eventKey: key,
    });
  }
}

/** Fournisseur d'e-mails simulé. Les adresses en `@echec.test` échouent toujours (tests REC-08). */
function simulatedProvider(db: Database, log: EmailDeliveryLog): { ok: true } | { ok: false; code: string } {
  if (log.recipient.endsWith("@echec.test")) return { ok: false, code: "SMTP_550_MAILBOX_UNAVAILABLE" };
  if (db.app_settings.demo_email_failure_rate > 0 && Math.random() < db.app_settings.demo_email_failure_rate) {
    return { ok: false, code: "SMTP_421_TEMPORARY_FAILURE" };
  }
  return { ok: true };
}

export function processEmails(db: Database, now: Date, s: JobsSummary): void {
  const iso = now.toISOString();
  const max = db.app_settings.email_max_attempts;
  for (const log of db.email_delivery_logs) {
    if (log.status !== "PENDING" && log.status !== "RETRY") continue;
    if (log.next_attempt_at && new Date(log.next_attempt_at).getTime() > now.getTime()) continue;
    log.attempt_count += 1;
    log.last_attempt_at = iso;
    const result = simulatedProvider(db, log);
    if (result.ok) {
      log.status = "SENT";
      log.sent_at = iso;
      log.error_code = null;
      log.next_attempt_at = null;
      const mail = renderEmail(log.template_key, log.template_params);
      db.demo_mailbox.push({ id: newId("mbx"), delivery_id: log.id, to: log.recipient, ...mail, received_at: iso });
      s.emailsSent++;
      continue;
    }
    log.error_code = result.code;
    if (log.attempt_count >= max) {
      log.status = "FAILED";
      log.next_attempt_at = null;
      s.emailsFailed++;
      notify(db, now, {
        recipients: activeAdmins(db),
        type: "NOTIFICATION_FAILURE",
        title: "Échec d’envoi d’e-mail",
        summary: `L’e-mail « ${log.template_key} » destiné à ${log.recipient} n’a pas pu être envoyé après ${log.attempt_count} tentatives (${result.code}).`,
        eventKey: `EMAIL_FAILED:${log.id}:${log.attempt_count}`,
        email: false, // pas d'e-mail pour signaler un échec d'e-mail
      });
    } else {
      log.status = "RETRY";
      const wait = EMAIL_BACKOFF_MINUTES[Math.min(log.attempt_count - 1, EMAIL_BACKOFF_MINUTES.length - 1)]!;
      log.next_attempt_at = new Date(now.getTime() + wait * 60_000).toISOString();
    }
  }
}

/** Nettoyage des données techniques temporaires (sessions et jetons expirés depuis 7 jours). */
export function cleanup(db: Database, now: Date, s: JobsSummary): void {
  // Données de sécurité : heure réelle (hors décalage de l'horloge de démonstration).
  const limit = now.getTime() - db.meta.clock_offset_ms - 7 * 24 * 3600_000;
  const before = db.sessions.length + db.auth_tokens.length;
  db.sessions = db.sessions.filter((x) => new Date(x.expires_at).getTime() > limit && !(x.revoked_at && new Date(x.revoked_at).getTime() < limit));
  db.auth_tokens = db.auth_tokens.filter((x) => new Date(x.expires_at).getTime() > limit);
  s.cleaned += before - db.sessions.length - db.auth_tokens.length;
}

export function runScheduledJobs(db: Database, now: Date): JobsSummary {
  const started = now.toISOString();
  const s: JobsSummary = { reminders: 0, overdue: 0, escalations: 0, coachAlerts: 0, emailsSent: 0, emailsFailed: 0, cleaned: 0 };
  let error: string | null = null;
  const steps: Array<[string, (d: Database, n: Date, x: JobsSummary) => void]> = [
    ["deadlines", processDeadlines],
    ["coach-availability", processCoachAvailability],
    ["emails", processEmails],
    ["cleanup", cleanup],
  ];
  for (const [name, fn] of steps) {
    try {
      fn(db, now, s);
    } catch (e) {
      // Une tâche en échec ne bloque pas les autres ; l'erreur est journalisée et visible par l'admin.
      error = `${name}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  const changed = Object.values(s).some((v) => v > 0);
  if (changed || error) {
    const run: JobRun = {
      id: newId("job"),
      job: "scheduler",
      started_at: started,
      finished_at: now.toISOString(),
      ok: error === null,
      summary: `Rappels ${s.reminders} · Retards ${s.overdue} · Escalades ${s.escalations} · Alertes coach ${s.coachAlerts} · E-mails envoyés ${s.emailsSent} / échecs définitifs ${s.emailsFailed}`,
      error,
    };
    db.job_runs.push(run);
    if (db.job_runs.length > 200) db.job_runs.splice(0, db.job_runs.length - 200);
  }
  return s;
}
