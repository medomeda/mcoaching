import { desc, eq, gte, sql } from "drizzle-orm";
import type { SiteDb } from "@/db/client";
import { client, healthCheck, plan, prospect, usageSnapshot } from "@/db/schema";
import { offlineSince, type ClientState } from "@/lib/alerts";

/** États des clients (santé récente + dernier relevé d'usage) pour les alertes et les listes. */
export async function loadClientStates(db: SiteDb, now = new Date()) {
  const clients = await db.select().from(client);
  const since = new Date(now.getTime() - 24 * 3_600_000);
  // Filtrage et « dernier par client » faits en SQL : l'historique complet (des milliers de lignes par client) n'est jamais chargé.
  const recentChecks = await db.select().from(healthCheck).where(gte(healthCheck.checkedAt, since)).orderBy(desc(healthCheck.checkedAt));
  const lastChecks = await db.selectDistinctOn([healthCheck.clientId]).from(healthCheck).orderBy(healthCheck.clientId, desc(healthCheck.checkedAt));
  const snaps = await db.selectDistinctOn([usageSnapshot.clientId]).from(usageSnapshot).orderBy(usageSnapshot.clientId, desc(usageSnapshot.day));
  const states: ClientState[] = clients.map((c) => {
    const mine = recentChecks.filter((h) => h.clientId === c.id);
    const snap = snaps.find((s) => s.clientId === c.id);
    const k = snap?.counters as Partial<NonNullable<ClientState["usage"]>> | undefined;
    return {
      id: c.id, name: c.name, instanceHost: c.instanceHost, status: c.status, createdAt: c.createdAt, planId: c.planId, trialEndsOn: c.trialEndsOn, nextDueOn: c.nextDueOn,
      offlineSince: offlineSince(mine),
      usage: k ? { suspended: !!k.suspended, coaches_active: k.coaches_active ?? 0, members_active: k.members_active ?? 0, last_activity_at: k.last_activity_at ?? null } : null,
    };
  });
  const lastCheck = new Map(lastChecks.map((h) => [h.clientId, { ok: h.ok, at: h.checkedAt }]));
  const plans = new Map((await db.select().from(plan)).map((p) => [p.id, { maxCoaches: p.maxCoaches, maxMembers: p.maxMembers }]));
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(prospect).where(eq(prospect.status, "NOUVEAU"));
  return { states, lastCheck, plans, newProspects: n };
}

export async function usageHistory(db: SiteDb, clientId: string, days = 60) {
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await db.select().from(usageSnapshot).where(eq(usageSnapshot.clientId, clientId)).orderBy(usageSnapshot.day);
  return rows.filter((r) => r.day >= from).map((r) => ({ day: r.day, members: Number((r.counters as { members_active?: number }).members_active ?? 0), requests: Number((r.counters as { requests_this_month?: number }).requests_this_month ?? 0) }));
}

