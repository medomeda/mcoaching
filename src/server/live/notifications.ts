/** Notifications in-app (PRD §9.11) et supervision des envois (incidents, relances), sur PostgreSQL. */
import { and, count, desc, eq, isNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import { businessRule, forbidden, notFound } from "@/modules/core/errors";
import { parse } from "@/modules/core/validation";
import { db } from "../pg/client";
import { emailDeliveryLog, jobRun, notification } from "../pg/schema";
import { authenticate, type LiveCall } from "./context";
import { audit, pageOf } from "./helpers";
import { recentJobRuns, runScheduledJobs } from "./jobs";
import { iso } from "./mappers";

const unreadOf = (userId: string) => and(eq(notification.userId, userId), isNull(notification.readAt));

async function unreadCount(userId: string) {
  return (await db.select({ n: count() }).from(notification).where(unreadOf(userId)))[0]?.n ?? 0;
}

export async function listMyNotifications(call: LiveCall, input: unknown) {
  const a = await authenticate(call);
  const f = parse(
    z.object({ unreadOnly: z.boolean().default(false), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(20) }),
    input ?? {},
  );
  const where = f.unreadOnly ? unreadOf(a.user.id) : eq(notification.userId, a.user.id);
  const total = (await db.select({ n: count() }).from(notification).where(where))[0]?.n ?? 0;
  const { page, pages } = pageOf(total, f.page, f.pageSize);
  const rows = await db
    .select()
    .from(notification)
    .where(where)
    .orderBy(desc(notification.createdAt))
    .limit(f.pageSize)
    .offset((page - 1) * f.pageSize);
  return {
    items: rows.map((n) => ({
      id: n.id,
      user_id: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      related_request_id: n.relatedRequestId,
      event_key: n.eventKey,
      read_at: iso(n.readAt),
      created_at: n.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize: f.pageSize,
    pages,
    unread: await unreadCount(a.user.id),
  };
}

export async function unreadNotificationCount(call: LiveCall) {
  const a = await authenticate(call);
  return unreadCount(a.user.id);
}

export async function markNotificationRead(call: LiveCall, id: string) {
  const a = await authenticate(call);
  const [n] = await db.select({ userId: notification.userId }).from(notification).where(eq(notification.id, String(id)));
  if (!n) throw notFound("Notification introuvable.");
  if (n.userId !== a.user.id) throw forbidden();
  await db.update(notification).set({ readAt: new Date() }).where(and(eq(notification.id, String(id)), isNull(notification.readAt)));
}

export async function markAllNotificationsRead(call: LiveCall) {
  const a = await authenticate(call);
  await db.update(notification).set({ readAt: new Date() }).where(unreadOf(a.user.id));
}

// ---------- supervision (admin) ----------

const EMAIL_STATUSES = ["PENDING", "RETRY", "SENT", "FAILED"] as const;

export async function listEmailDeliveries(call: LiveCall, input: unknown) {
  await authenticate(call, "ADMIN");
  const f = parse(
    z.object({ status: z.enum(EMAIL_STATUSES).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(20) }),
    input ?? {},
  );
  const where: SQL | undefined = f.status ? eq(emailDeliveryLog.status, f.status) : undefined;
  const total = (await db.select({ n: count() }).from(emailDeliveryLog).where(where))[0]?.n ?? 0;
  const { page, pages } = pageOf(total, f.page, f.pageSize);
  const rows = await db
    .select()
    .from(emailDeliveryLog)
    .where(where)
    .orderBy(desc(emailDeliveryLog.createdAt))
    .limit(f.pageSize)
    .offset((page - 1) * f.pageSize);
  const grouped = await db.select({ status: emailDeliveryLog.status, n: count() }).from(emailDeliveryLog).groupBy(emailDeliveryLog.status);
  const counts = { PENDING: 0, RETRY: 0, SENT: 0, FAILED: 0 };
  for (const g of grouped) counts[g.status] = g.n;
  return {
    items: rows.map((e) => ({
      id: e.id,
      notification_id: e.notificationId,
      recipient: e.recipient,
      template_key: e.templateKey,
      // Les paramètres du gabarit ne contiennent aucun contenu privé ; seul le titre est exposé.
      template_params: { title: e.templateParams.title ?? "" },
      status: e.status,
      attempt_count: e.attemptCount,
      last_attempt_at: iso(e.lastAttemptAt),
      next_attempt_at: iso(e.nextAttemptAt),
      sent_at: iso(e.sentAt),
      error_code: e.errorCode,
      created_at: e.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize: f.pageSize,
    pages,
    counts,
  };
}

export async function retryEmail(call: LiveCall, id: string) {
  const a = await authenticate(call, "ADMIN");
  await db.transaction(async (tx) => {
    const [e] = await tx.select().from(emailDeliveryLog).where(eq(emailDeliveryLog.id, String(id))).for("update");
    if (!e) throw notFound("Envoi introuvable.");
    if (e.status === "SENT") throw businessRule("Cet e-mail a déjà été envoyé.");
    // Le lien d'un e-mail d'accès contient un jeton : il n'est pas conservé et ne peut être renvoyé tel quel.
    if (e.templateKey !== "NOTIFICATION") {
      throw businessRule("E-mail d’accès : utilisez « Renvoyer l’accès » depuis la fiche de l’utilisateur (nouveau lien).");
    }
    // Nouvelle série de tentatives ; le nombre de tentatives précédentes est conservé dans l'audit.
    await tx.update(emailDeliveryLog).set({ status: "RETRY", nextAttemptAt: new Date(), attemptCount: 0 }).where(eq(emailDeliveryLog.id, e.id));
    await audit(tx, {
      actor_id: a.user.id,
      action: "EMAIL_RETRY_REQUESTED",
      entity_type: "email_delivery",
      entity_id: e.id,
      reason: null,
      metadata: { recipient: e.recipient, previous_attempts: e.attemptCount, last_error: e.errorCode },
    });
  });
  await runScheduledJobs();
}

export async function listJobRuns(call: LiveCall) {
  await authenticate(call, "ADMIN");
  return (await recentJobRuns()).map((j) => ({
    id: j.id,
    job: j.job,
    started_at: j.startedAt.toISOString(),
    finished_at: j.finishedAt.toISOString(),
    ok: j.ok,
    summary: j.summary,
    error: j.error,
  }));
}

export async function runJobsNow(call: LiveCall) {
  const a = await authenticate(call, "ADMIN");
  await runScheduledJobs();
  await audit(db, { actor_id: a.user.id, action: "JOBS_TRIGGERED_MANUALLY", entity_type: "scheduler", entity_id: null, reason: null });
}

export async function incidentsSummary(call: LiveCall) {
  await authenticate(call, "ADMIN");
  const byStatus = async (status: "FAILED" | "RETRY") =>
    (await db.select({ n: count() }).from(emailDeliveryLog).where(eq(emailDeliveryLog.status, status)))[0]?.n ?? 0;
  const failedJobs = (await db.select({ n: count() }).from(jobRun).where(eq(jobRun.ok, false)))[0]?.n ?? 0;
  const [last] = await listLastRun();
  return { failed_emails: await byStatus("FAILED"), retrying_emails: await byStatus("RETRY"), failed_jobs: failedJobs, last_run: last ?? null };
}

async function listLastRun() {
  return (await recentJobRuns(1)).map((j) => ({
    id: j.id,
    job: j.job,
    started_at: j.startedAt.toISOString(),
    finished_at: j.finishedAt.toISOString(),
    ok: j.ok,
    summary: j.summary,
    error: j.error,
  }));
}
