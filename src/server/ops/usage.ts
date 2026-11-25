/**
 * Données exposées à l'opérateur : COMPTEURS UNIQUEMENT (jamais de nom, de message ni de pièce jointe),
 * et suspension réversible de l'instance. Voir docs/superpowers/specs/2026-11-24-mentora-site-saas-design.md §6.5.
 */
import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import pkg from "../../../package.json";
import { REQUEST_STATUSES } from "@/modules/core/types";
import { isOpen } from "@/modules/requests/stateMachine";
import { db } from "../pg/client";
import { appSettings, coachingMessage, coachingRequest, serviceCalendar, session, user } from "../pg/schema";
import { slaResolver } from "../live/sla";

export const DEFAULT_SUSPENSION_MESSAGE = "Cet espace est temporairement suspendu. Contactez votre prestataire pour le réactiver.";

export interface OpsUsage {
  version: string;
  generated_at: string;
  suspended: boolean;
  coaches_active: number;
  members_active: number;
  requests_this_month: number;
  requests_overdue: number;
  last_activity_at: string | null;
}

export const appVersion = (): string => process.env.APP_VERSION?.trim() || pkg.version;

const OPEN = REQUEST_STATUSES.filter(isOpen);

export async function computeUsage(now: Date): Promise<OpsUsage> {
  const [cal] = await db.select({ tz: serviceCalendar.timezone }).from(serviceCalendar).where(eq(serviceCalendar.isActive, true)).limit(1);
  const tz = cal?.tz ?? "UTC";
  const countUsers = async (role: "COACH" | "LEARNER") =>
    (await db.select({ n: count() }).from(user).where(and(eq(user.role, role), eq(user.status, "ACTIVE"))))[0]?.n ?? 0;
  const monthStart = sql`(date_trunc('month', ${now.toISOString()}::timestamptz at time zone ${tz})) at time zone ${tz}`;
  const [month] = await db
    .select({ n: count() })
    .from(coachingRequest)
    .where(and(ne(coachingRequest.status, "DRAFT"), sql`${coachingRequest.createdAt} >= ${monthStart}`));
  const open = await db.select().from(coachingRequest).where(inArray(coachingRequest.status, OPEN));
  const sla = await slaResolver(db, open, now);
  const [login] = await db.select({ at: sql<Date | null>`max(${user.lastLoginAt})` }).from(user);
  const [msg] = await db.select({ at: coachingMessage.createdAt }).from(coachingMessage).orderBy(desc(coachingMessage.createdAt)).limit(1);
  const dates = [login?.at ? new Date(login.at) : null, msg?.at ?? null].filter((d): d is Date => d !== null);
  const last = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
  return {
    version: appVersion(),
    generated_at: now.toISOString(),
    suspended: (await getSuspension()).suspended,
    coaches_active: await countUsers("COACH"),
    members_active: await countUsers("LEARNER"),
    requests_this_month: month?.n ?? 0,
    requests_overdue: open.filter((r) => sla(r)?.isOverdue).length,
    last_activity_at: last ? last.toISOString() : null,
  };
}

/* ------------------------------ Suspension ------------------------------ */

const g = globalThis as unknown as { mentoraSuspension?: { value: { suspended: boolean; message: string | null }; at: number } };
const TTL_MS = 2_000;

/** État de suspension, avec un cache très court (remis à zéro à chaque changement dans ce processus). */
export async function getSuspension(): Promise<{ suspended: boolean; message: string | null }> {
  const c = g.mentoraSuspension;
  if (c && Date.now() - c.at < TTL_MS) return c.value;
  const [s] = await db.select({ suspended: appSettings.suspended, message: appSettings.suspensionMessage }).from(appSettings).where(eq(appSettings.id, "app"));
  const value = { suspended: s?.suspended ?? false, message: s?.suspended ? s.message || DEFAULT_SUSPENSION_MESSAGE : null };
  g.mentoraSuspension = { value, at: Date.now() };
  return value;
}

export async function setSuspension(suspended: boolean, message: string | null): Promise<void> {
  const clean = message?.trim() || null;
  await db.transaction(async (tx) => {
    await tx.update(appSettings).set({ suspended, suspensionMessage: suspended ? clean : null, updatedAt: new Date() }).where(eq(appSettings.id, "app"));
    // Les sessions ouvertes sont invalidées : plus aucun appel authentifié pendant la suspension.
    if (suspended) await tx.delete(session);
  });
  g.mentoraSuspension = undefined;
}
