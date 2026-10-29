/**
 * Tâches planifiées sur PostgreSQL (PRD §7.4, §14). Idempotentes et sûres en parallèle :
 * chaque e-mail est réclamé par `FOR UPDATE SKIP LOCKED`, deux processus ne l'envoient jamais deux fois.
 * L'idempotence repose sur les clés d'événement uniques (`notification_event`) : rejouées au même instant,
 * les tâches ne produisent aucun doublon et ne modifient jamais une échéance enregistrée.
 */
import { and, desc, eq, gt, inArray, isNotNull, isNull, like, lt, lte, or, sql } from "drizzle-orm";
import { REQUEST_STATUSES } from "@/modules/core/types";
import { isOpen } from "@/modules/requests/stateMachine";
import { newId } from "../crypto";
import { renderEmail } from "../mail/templates";
import { sendEmail } from "../mail/sender";
import { db } from "../pg/client";
import {
  coachAbsence,
  coachingRequest,
  coachingRequestCycle,
  emailDeliveryLog,
  jobRun,
  loginAttempt,
  notificationEvent,
  rateLimit,
  servicePolicy,
  session,
  user,
  verification,
} from "../pg/schema";
import { getAppSettings } from "./config";
import { activeAdmins, notify, type Tx, type UserRowDb } from "./helpers";
import { slaResolver } from "./sla";
import { appUrl } from "../appUrl";

/** Délais entre tentatives d'envoi (minutes calendaires), comme la simulation. */
export const EMAIL_BACKOFF_MINUTES = [5, 15, 60, 240];
const EMAIL_BATCH = 50;

export interface JobsSummary {
  reminders: number;
  overdue: number;
  escalations: number;
  coachAlerts: number;
  emailsSent: number;
  emailsFailed: number;
  cleaned: number;
}

const OPEN = REQUEST_STATUSES.filter(isOpen);

async function hasEvent(tx: Tx, key: string) {
  const [e] = await tx
    .select({ key: notificationEvent.key })
    .from(notificationEvent)
    .where(or(eq(notificationEvent.key, key), like(notificationEvent.key, `${key}:%`)))
    .limit(1);
  return !!e;
}

async function markEvent(tx: Tx, key: string) {
  await tx.insert(notificationEvent).values({ key }).onConflictDoNothing();
}

/**
 * Rappels à 50 % et 75 % du délai, passage en retard, escalade (PRD §7.4) — même logique que la simulation.
 * Aucun rappel après une 1ʳᵉ réponse humaine ; si plusieurs seuils sont franchis d'un coup,
 * seul le plus avancé est envoyé (les autres sont marqués comme traités).
 */
export async function processDeadlines(now: Date, s: JobsSummary): Promise<void> {
  const rows = await db
    .select({ req: coachingRequest })
    .from(coachingRequest)
    .innerJoin(
      coachingRequestCycle,
      and(eq(coachingRequestCycle.requestId, coachingRequest.id), eq(coachingRequestCycle.cycleNumber, coachingRequest.currentCycleNumber)),
    )
    .where(and(inArray(coachingRequest.status, OPEN), isNull(coachingRequestCycle.firstResponseAt)));
  if (rows.length === 0) return;
  const requests = rows.map((r) => r.req);
  const sla = await slaResolver(db, requests, now);
  const cycles = await db.select().from(coachingRequestCycle).where(inArray(coachingRequestCycle.requestId, requests.map((r) => r.id)));
  const policies = new Map((await db.select().from(servicePolicy)).map((p) => [p.id, p]));
  const coachIds = [...new Set(requests.map((r) => r.coachId).filter((x): x is string => !!x))];
  const coaches = new Map((coachIds.length ? await db.select().from(user).where(inArray(user.id, coachIds)) : []).map((u) => [u.id, u]));

  for (const req of requests) {
    const st = sla(req);
    const cycle = cycles.find((c) => c.requestId === req.id && c.cycleNumber === req.currentCycleNumber);
    const policy = cycle && policies.get(cycle.policyId);
    if (!st || !cycle || !policy) continue;
    const coach = req.coachId ? coaches.get(req.coachId) : undefined;
    const base = `${req.id}:${cycle.cycleNumber}`;
    const ref = req.reference ?? "";
    const toCoach: UserRowDb[] = coach ? [coach] : [];

    await db.transaction(async (tx) => {
      const stages = [
        {
          key: `REMINDER_50:${base}`,
          reached: st.ratio >= 0.5,
          enabled: policy.reminder50Enabled,
          send: async () => {
            s.reminders += await notify(tx, {
              recipients: toCoach,
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
          reached: st.ratio >= 0.75,
          enabled: policy.reminder75Enabled,
          send: async () => {
            s.reminders += await notify(tx, {
              recipients: toCoach,
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
          reached: st.isOverdue,
          enabled: true,
          send: async () => {
            s.overdue += await notify(tx, {
              recipients: toCoach,
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
      for (const stage of reached) {
        if (await hasEvent(tx, stage.key)) continue;
        if (stage === top && stage.enabled) await stage.send();
        await markEvent(tx, stage.key);
      }

      if (st.isOverdue && st.overdueMinutes >= policy.overdueEscalationWorkingMinutes) {
        const key = `ESCALATION:${base}`;
        if (!(await hasEvent(tx, key))) {
          s.escalations += await notify(tx, {
            recipients: await activeAdmins(tx),
            type: "ESCALATION",
            title: `Escalade : ${ref} sans réponse`,
            summary: `La demande ${ref} (coach : ${coach?.name ?? "non affecté"}) dépasse son échéance de plus de ${Math.round(policy.overdueEscalationWorkingMinutes / 60)} h ouvrées.`,
            requestId: req.id,
            eventKey: key,
          });
          await markEvent(tx, key);
        }
      }
    });
  }
}

/** Alerte l'administrateur si un coach suspendu ou absent a des demandes nécessitant une action. */
export async function processCoachAvailability(now: Date, s: JobsSummary): Promise<void> {
  const actionable = OPEN.filter((x) => x !== "RESPONSE_PROVIDED" && x !== "WAITING_FOR_LEARNER");
  const rows = await db
    .select({ req: coachingRequest, coach: user })
    .from(coachingRequest)
    .innerJoin(user, eq(user.id, coachingRequest.coachId))
    .where(inArray(coachingRequest.status, actionable));
  if (rows.length === 0) return;
  const absences = await db
    .select()
    .from(coachAbsence)
    .where(and(isNull(coachAbsence.cancelledAt), lte(coachAbsence.startsAt, now), gt(coachAbsence.endsAt, now)));
  const admins = await activeAdmins(db);
  for (const { req, coach } of rows) {
    let reason: string | null = null;
    let key: string | null = null;
    if (coach.status === "SUSPENDED") {
      reason = "le coach responsable est suspendu";
      key = `COACH_SUSPENDED:${req.id}:${coach.id}`;
    } else {
      const absence = absences.find((a) => a.coachId === coach.id);
      if (absence) {
        reason = "le coach responsable est absent";
        key = `COACH_ABSENT:${req.id}:${absence.id}`;
      }
    }
    if (!key || !reason) continue;
    s.coachAlerts += await notify(db, {
      recipients: admins,
      type: "COACH_UNAVAILABLE",
      title: `Continuité de service : ${req.reference}`,
      summary: `La demande ${req.reference} nécessite une action alors que ${reason} (${coach.name}). Une réaffectation peut être nécessaire.`,
      requestId: req.id,
      eventKey: key,
    });
  }
}

/** Nettoyage des données techniques temporaires (expirées depuis plus de 7 jours). */
export async function cleanup(now: Date, s: JobsSummary): Promise<void> {
  const limit = new Date(now.getTime() - 7 * 24 * 3600_000);
  const sessions = await db.delete(session).where(lt(session.expiresAt, limit)).returning({ id: session.id });
  const tokens = await db.delete(verification).where(lt(verification.expiresAt, limit)).returning({ id: verification.id });
  const limits = await db.delete(rateLimit).where(lt(rateLimit.lastRequest, limit.getTime())).returning({ id: rateLimit.id });
  const locks = await db
    .delete(loginAttempt)
    .where(and(or(isNull(loginAttempt.lockedUntil), lt(loginAttempt.lockedUntil, now)), isNotNull(loginAttempt.lastFailureAt), lt(loginAttempt.lastFailureAt, limit)))
    .returning({ email: loginAttempt.email });
  s.cleaned += sessions.length + tokens.length + limits.length + locks.length;
}

/** Envoie les e-mails dus, un par transaction (verrou de ligne pendant l'envoi). */
export async function processEmails(_runStart: Date, s: JobsSummary): Promise<void> {
  // Heure relue ici, et non celle du début de l'exécution : les e-mails des notifications créées
  // par les étapes précédentes de la même exécution sont ainsi envoyés tout de suite.
  const now = new Date();
  const max = (await getAppSettings(db)).email_max_attempts;
  const baseUrl = appUrl();
  for (let i = 0; i < EMAIL_BATCH; i++) {
    const done = await db.transaction(async (tx) => {
      const [log] = await tx
        .select()
        .from(emailDeliveryLog)
        .where(
          and(
            inArray(emailDeliveryLog.status, ["PENDING", "RETRY"]),
            or(sql`${emailDeliveryLog.nextAttemptAt} is null`, lte(emailDeliveryLog.nextAttemptAt, now)),
          ),
        )
        .orderBy(emailDeliveryLog.createdAt)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!log) return true;

      const params = log.templateParams;
      const mail = renderEmail(log.templateKey, params);
      const result = await sendEmail({ to: log.recipient, ...mail, link: mail.link ? `${baseUrl}${mail.link}` : null });
      const at = new Date();
      const attempts = log.attemptCount + 1;
      if (result.ok) {
        await tx
          .update(emailDeliveryLog)
          .set({ status: "SENT", attemptCount: attempts, lastAttemptAt: at, sentAt: at, errorCode: null, nextAttemptAt: null })
          .where(eq(emailDeliveryLog.id, log.id));
        s.emailsSent++;
        return false;
      }
      if (attempts >= max) {
        await tx
          .update(emailDeliveryLog)
          .set({ status: "FAILED", attemptCount: attempts, lastAttemptAt: at, errorCode: result.code, nextAttemptAt: null })
          .where(eq(emailDeliveryLog.id, log.id));
        s.emailsFailed++;
        await notify(tx, {
          recipients: await activeAdmins(tx),
          type: "NOTIFICATION_FAILURE",
          title: "Échec d’envoi d’e-mail",
          summary: `L’e-mail « ${log.templateKey} » destiné à ${log.recipient} n’a pas pu être envoyé après ${attempts} tentatives (${result.code}).`,
          eventKey: `EMAIL_FAILED:${log.id}:${attempts}`,
          email: false, // pas d'e-mail pour signaler un échec d'e-mail
        });
        return false;
      }
      const wait = EMAIL_BACKOFF_MINUTES[Math.min(attempts - 1, EMAIL_BACKOFF_MINUTES.length - 1)]!;
      await tx
        .update(emailDeliveryLog)
        .set({ status: "RETRY", attemptCount: attempts, lastAttemptAt: at, errorCode: result.code, nextAttemptAt: new Date(at.getTime() + wait * 60_000) })
        .where(eq(emailDeliveryLog.id, log.id));
      return false;
    });
    if (done) return;
  }
}

/** Exécute les tâches ; une tâche en échec ne bloque pas les autres. Journalise si quelque chose a changé. */
export async function runScheduledJobs(): Promise<JobsSummary> {
  const started = new Date();
  const s: JobsSummary = { reminders: 0, overdue: 0, escalations: 0, coachAlerts: 0, emailsSent: 0, emailsFailed: 0, cleaned: 0 };
  let error: string | null = null;
  // Les e-mails passent après les notifications du même cycle : ils partent dans la même exécution.
  const steps: Array<[string, (now: Date, x: JobsSummary) => Promise<void>]> = [
    ["deadlines", processDeadlines],
    ["coach-availability", processCoachAvailability],
    ["emails", processEmails],
    ["cleanup", cleanup],
  ];
  for (const [name, fn] of steps) {
    try {
      await fn(started, s);
    } catch (e) {
      error = `${name}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  if (Object.values(s).some((v) => v > 0) || error) {
    await db.insert(jobRun).values({
      id: newId("job"),
      job: "scheduler",
      startedAt: started,
      finishedAt: new Date(),
      ok: error === null,
      summary: `Rappels ${s.reminders} · Retards ${s.overdue} · Escalades ${s.escalations} · Alertes coach ${s.coachAlerts} · E-mails envoyés ${s.emailsSent} / échecs définitifs ${s.emailsFailed}`,
      error,
    });
  }
  return s;
}

export async function recentJobRuns(limit = 50) {
  return db.select().from(jobRun).orderBy(desc(jobRun.startedAt)).limit(limit);
}

const SCHEDULER_INTERVAL_MS = 60_000;
const g = globalThis as unknown as { mcoachingScheduler?: ReturnType<typeof setInterval> };

/**
 * Planificateur intégré au serveur Next (lancé par `instrumentation.ts`), une exécution par minute.
 * Sans danger avec plusieurs instances (verrous `SKIP LOCKED`) ; désactivable par DISABLE_SCHEDULER=true
 * si les tâches sont confiées à un processus ou un cron séparé (`npm run jobs`).
 */
export function startScheduler() {
  if (g.mcoachingScheduler || process.env.DISABLE_SCHEDULER === "true") return;
  let running = false;
  g.mcoachingScheduler = setInterval(() => {
    if (running) return;
    running = true;
    runScheduledJobs()
      .catch((e) => console.error("[scheduler]", e))
      .finally(() => (running = false));
  }, SCHEDULER_INTERVAL_MS);
}
