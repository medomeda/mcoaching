/** Notifications in-app (PRD §9.11) et supervision des envois (incidents, relances). */
import { z } from "zod";
import { businessRule, forbidden, notFound } from "@/modules/core/errors";
import { audit, paginate } from "../db/helpers";
import { authenticate, catchUpJobs, parse, reauth, resetJobThrottle, store, type Call } from "./context";

export async function listMyNotifications(call: Call, input: unknown) {
  const a = await authenticate(call);
  const f = parse(z.object({ unreadOnly: z.boolean().default(false), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(20) }), input ?? {});
  const db = store().snapshot();
  const items = db.notifications
    .filter((n) => n.user_id === a.user.id && (!f.unreadOnly || !n.read_at))
    .sort((x, y) => y.created_at.localeCompare(x.created_at));
  return { ...paginate(items, f.page, f.pageSize), unread: db.notifications.filter((n) => n.user_id === a.user.id && !n.read_at).length };
}

export async function unreadNotificationCount(call: Call) {
  const a = await authenticate(call);
  const db = store().snapshot();
  return db.notifications.filter((n) => n.user_id === a.user.id && !n.read_at).length;
}

export async function markNotificationRead(call: Call, id: string) {
  const a = await authenticate(call);
  await store().transaction((db, now) => {
    reauth(db, a);
    const n = db.notifications.find((x) => x.id === id);
    if (!n) throw notFound("Notification introuvable.");
    if (n.user_id !== a.user.id) throw forbidden();
    if (!n.read_at) n.read_at = now.toISOString();
  });
}

export async function markAllNotificationsRead(call: Call) {
  const a = await authenticate(call);
  await store().transaction((db, now) => {
    reauth(db, a);
    for (const n of db.notifications) if (n.user_id === a.user.id && !n.read_at) n.read_at = now.toISOString();
  });
}

// ---------- supervision (admin) ----------

export async function listEmailDeliveries(call: Call, input: unknown) {
  await authenticate(call, "ADMIN");
  const f = parse(
    z.object({ status: z.enum(["PENDING", "RETRY", "SENT", "FAILED"]).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(20) }),
    input ?? {},
  );
  const db = store().snapshot();
  const items = db.email_delivery_logs
    .filter((e) => !f.status || e.status === f.status)
    .sort((x, y) => y.created_at.localeCompare(x.created_at))
    // Les paramètres du gabarit ne contiennent aucun contenu privé ; le lien (jeton) est masqué.
    .map((e) => ({ ...e, template_params: { title: e.template_params.title ?? "" } }));
  const counts = { PENDING: 0, RETRY: 0, SENT: 0, FAILED: 0 };
  for (const e of db.email_delivery_logs) counts[e.status]++;
  return { ...paginate(items, f.page, f.pageSize), counts };
}

export async function retryEmail(call: Call, id: string) {
  const a = await authenticate(call, "ADMIN");
  await store().transaction((db, now) => {
    reauth(db, a);
    const e = db.email_delivery_logs.find((x) => x.id === id);
    if (!e) throw notFound("Envoi introuvable.");
    if (e.status === "SENT") throw businessRule("Cet e-mail a déjà été envoyé.");
    const previousAttempts = e.attempt_count;
    // Nouvelle série de tentatives ; le nombre de tentatives précédentes est conservé dans l'audit.
    e.status = "RETRY";
    e.next_attempt_at = now.toISOString();
    e.attempt_count = 0;
    audit(db, now, { actor_id: a.user.id, action: "EMAIL_RETRY_REQUESTED", entity_type: "email_delivery", entity_id: e.id, reason: null, metadata: { recipient: e.recipient, previous_attempts: previousAttempts, last_error: e.error_code } });
  });
  resetJobThrottle();
  await catchUpJobs(true);
}

export async function listJobRuns(call: Call) {
  await authenticate(call, "ADMIN");
  const db = store().snapshot();
  return [...db.job_runs].sort((x, y) => y.started_at.localeCompare(x.started_at)).slice(0, 50);
}

export async function runJobsNow(call: Call) {
  const a = await authenticate(call, "ADMIN");
  resetJobThrottle();
  await catchUpJobs(true);
  await store().transaction((db, now) => {
    audit(db, now, { actor_id: a.user.id, action: "JOBS_TRIGGERED_MANUALLY", entity_type: "scheduler", entity_id: null, reason: null });
  });
}

export async function incidentsSummary(call: Call) {
  await authenticate(call, "ADMIN");
  const db = store().snapshot();
  return {
    failed_emails: db.email_delivery_logs.filter((e) => e.status === "FAILED").length,
    retrying_emails: db.email_delivery_logs.filter((e) => e.status === "RETRY").length,
    failed_jobs: db.job_runs.filter((j) => !j.ok).length,
    last_run: [...db.job_runs].sort((x, y) => y.started_at.localeCompare(x.started_at))[0] ?? null,
  };
}
