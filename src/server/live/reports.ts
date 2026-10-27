/**
 * Tableaux de bord, rapports, exports (PRD §9.12, §10.2, §10.3) et journal d'audit (§12.20) sur PostgreSQL.
 * Les indicateurs réutilisent `computeMetrics` (module pur) sur une tranche de la base chargée pour la période.
 */
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { REQUEST_STATUSES, type Database } from "@/modules/core/types";
import { parse } from "@/modules/core/validation";
import { toCsv } from "@/modules/reporting/csv";
import { computeMetrics } from "@/modules/reporting/metrics";
import { AWAITING_COACH_STATUSES, isOpen, STATUS_LABELS } from "@/modules/requests/stateMachine";
import { createEmptyDatabase } from "../db/schema";
import { db } from "../pg/client";
import {
  auditLog,
  coachAssignment,
  coachingEntitlement,
  coachingMessage,
  coachingQuotaLedger,
  coachingRating,
  coachingRequest,
  coachingRequestCycle,
  requestStatusHistory,
  servicePolicy,
  serviceHoliday,
  user,
} from "../pg/schema";
import { allCategories, getAppSettings } from "./config";
import { authenticate, type LiveCall } from "./context";
import { audit, nameIn, namesOf, pageOf } from "./helpers";
import { iso, toCycle, toDomainUser, toEntitlement, toHoliday, toLedgerEntry, toPolicy, toRequest } from "./mappers";
import { needsAttention, summarize } from "./requests";

const zPeriod = z.object({ from: z.string().datetime(), to: z.string().datetime(), coachId: z.string().optional() });
const OPEN = REQUEST_STATUSES.filter(isOpen);
const AWAITING = AWAITING_COACH_STATUSES as readonly string[];

/**
 * Tranche de la base nécessaire aux indicateurs : demandes soumises dans la période, ouvertes,
 * ou dont un cycle a démarré dans la période ; leurs cycles, historiques et évaluations ;
 * coachs, catégories, politiques, fériés et quotas en vigueur.
 */
async function metricsSlice(from: Date, to: Date): Promise<Database> {
  const slice = createEmptyDatabase(new Date().toISOString());
  const cycleInPeriod = db
    .select({ id: coachingRequestCycle.requestId })
    .from(coachingRequestCycle)
    .where(and(gte(coachingRequestCycle.startedAt, from), lte(coachingRequestCycle.startedAt, to)));
  const requests = await db
    .select()
    .from(coachingRequest)
    .where(
      and(
        ne(coachingRequest.status, "DRAFT"),
        or(
          and(gte(coachingRequest.submittedAt, from), lte(coachingRequest.submittedAt, to)),
          inArray(coachingRequest.status, OPEN),
          inArray(coachingRequest.id, cycleInPeriod),
        ),
      ),
    );
  const ids = requests.map((r) => r.id);
  const [cycles, history, ratings, coaches, policies, holidays, entitlements] = await Promise.all([
    ids.length ? db.select().from(coachingRequestCycle).where(inArray(coachingRequestCycle.requestId, ids)) : [],
    // Ordre d'insertion conservé : le tri (stable) de `learnerWaitingMinutes` le respecte à horodatage égal.
    ids.length
      ? db.select().from(requestStatusHistory).where(inArray(requestStatusHistory.requestId, ids)).orderBy(asc(requestStatusHistory.createdAt), asc(requestStatusHistory.seq))
      : [],
    ids.length ? db.select().from(coachingRating).where(inArray(coachingRating.requestId, ids)) : [],
    db.select().from(user).where(eq(user.role, "COACH")).orderBy(asc(sql`lower(${user.name})`)),
    db.select().from(servicePolicy),
    db.select().from(serviceHoliday),
    db.select().from(coachingEntitlement).where(and(isNull(coachingEntitlement.supersededAt), eq(coachingEntitlement.quotaEnabled, true))),
  ]);
  const ledger = entitlements.length
    ? await db.select().from(coachingQuotaLedger).where(inArray(coachingQuotaLedger.entitlementId, entitlements.map((e) => e.id)))
    : [];

  slice.coaching_requests = requests.map(toRequest);
  slice.coaching_request_cycles = cycles.map(toCycle);
  slice.request_status_history = history.map((h) => ({
    id: h.id,
    request_id: h.requestId,
    cycle_id: h.cycleId,
    old_status: h.oldStatus,
    new_status: h.newStatus,
    changed_by: h.changedBy,
    reason: h.reason,
    created_at: h.createdAt.toISOString(),
  }));
  slice.coaching_ratings = ratings.map((r) => ({
    id: r.id,
    request_id: r.requestId,
    cycle_id: r.cycleId,
    cycle_number: r.cycleNumber,
    learner_id: r.learnerId,
    coach_id: r.coachId,
    score: r.score,
    comment: r.comment,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  }));
  slice.users = coaches.map(toDomainUser);
  slice.coaching_categories = await allCategories(db);
  slice.service_policies = policies.map(toPolicy);
  slice.service_holidays = holidays.map(toHoliday);
  slice.coaching_entitlements = entitlements.map(toEntitlement);
  slice.coaching_quota_ledger = ledger.map(toLedgerEntry);
  return slice;
}

async function metricsFor(from: Date, to: Date, coachId?: string) {
  return computeMetrics(await metricsSlice(from, to), { from, to, coachId }, new Date());
}

export async function adminDashboard(call: LiveCall, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const p = parse(zPeriod, input);
  const now = new Date();
  const metrics = await metricsFor(new Date(p.from), new Date(p.to));
  const open = await db.select().from(coachingRequest).where(inArray(coachingRequest.status, OPEN));
  const ctx = await summarize(db, open, a.user, now);
  const bySubmission = (x: { submitted_at: string | null }, y: { submitted_at: string | null }) => (x.submitted_at ?? "").localeCompare(y.submitted_at ?? "");
  const attention = open
    .map((r) => ({ ...ctx.get(r.id)!.summary, attention: needsAttention(r, ctx.get(r.id)!) }))
    .filter((x) => x.attention.length > 0)
    .sort(bySubmission);
  const oldest = open.map((r) => ctx.get(r.id)!.summary).sort(bySubmission).slice(0, 8);
  return { metrics, attention: attention.slice(0, 15), attention_total: attention.length, oldest, now: now.toISOString() };
}

export async function reportMetrics(call: LiveCall, input: unknown) {
  await authenticate(call, "ADMIN");
  const p = parse(zPeriod, input);
  return metricsFor(new Date(p.from), new Date(p.to), p.coachId);
}

/** Derniers messages reçus (humains, d'un autre que le lecteur) sur un ensemble de demandes. */
async function lastMessagesFor(requestIds: string[], viewerId: string, limit: number) {
  if (requestIds.length === 0) return [];
  return db
    .select()
    .from(coachingMessage)
    .where(
      and(
        inArray(coachingMessage.requestId, requestIds),
        eq(coachingMessage.kind, "USER"),
        sql`${coachingMessage.senderId} is distinct from ${viewerId}`,
      ),
    )
    .orderBy(desc(coachingMessage.createdAt), desc(coachingMessage.seq))
    .limit(limit);
}

export async function coachDashboard(call: LiveCall) {
  const a = await authenticate(call, "COACH");
  const now = new Date();
  const mine = await db.select().from(coachingRequest).where(and(eq(coachingRequest.coachId, a.user.id), ne(coachingRequest.status, "DRAFT")));
  const ctx = await summarize(db, mine, a.user, now);
  const open = mine.filter((r) => isOpen(r.status)).map((r) => ctx.get(r.id)!.summary);
  const messages = await lastMessagesFor(mine.map((r) => r.id), a.user.id, 6);
  const names = await namesOf(db, messages.map((m) => m.senderId));
  const byId = new Map(mine.map((r) => [r.id, r]));
  const settings = await getAppSettings(db);
  const ratings = settings.coach_can_view_ratings
    ? await db.select().from(coachingRating).where(eq(coachingRating.coachId, a.user.id)).orderBy(desc(coachingRating.createdAt))
    : [];
  return {
    counts: {
      todo: open.filter((s) => AWAITING.includes(s.status)).length,
      new: open.filter((s) => s.status === "SUBMITTED" || s.status === "WAITING_FOR_COACH").length,
      waiting_learner: open.filter((s) => s.status === "WAITING_FOR_LEARNER").length,
      response_provided: open.filter((s) => s.status === "RESPONSE_PROVIDED").length,
      overdue: open.filter((s) => s.sla?.is_overdue).length,
      due_soon: open.filter((s) => s.sla?.due_soon).length,
      unread: open.reduce((n, s) => n + s.unread, 0),
    },
    urgent: open
      .filter((s) => s.sla?.awaiting_first_response)
      .sort((x, y) => (x.due_at ?? "").localeCompare(y.due_at ?? ""))
      .slice(0, 8),
    last_messages: messages.map((m) => {
      const r = byId.get(m.requestId)!;
      return { id: m.id, request_id: r.id, reference: r.reference, subject: r.subject, sender: nameIn(names, m.senderId), created_at: m.createdAt.toISOString(), excerpt: m.body.slice(0, 140) };
    }),
    ratings: settings.coach_can_view_ratings
      ? {
          count: ratings.length,
          average: ratings.length ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length : null,
          recent: ratings.slice(0, 5).map((r) => ({ score: r.score, comment: r.comment, created_at: r.createdAt.toISOString(), reference: byId.get(r.requestId)?.reference ?? "" })),
        }
      : null,
  };
}

export async function learnerDashboard(call: LiveCall) {
  const a = await authenticate(call, "LEARNER");
  const now = new Date();
  const mine = await db.select().from(coachingRequest).where(eq(coachingRequest.learnerId, a.user.id));
  const ctx = await summarize(db, mine, a.user, now);
  const summaries = mine.map((r) => ctx.get(r.id)!.summary);
  const rated = mine.length
    ? await db.select({ requestId: coachingRating.requestId, cycleNumber: coachingRating.cycleNumber }).from(coachingRating).where(inArray(coachingRating.requestId, mine.map((r) => r.id)))
    : [];
  const messages = await lastMessagesFor(mine.map((r) => r.id), a.user.id, 5);
  const names = await namesOf(db, messages.map((m) => m.senderId));
  const byId = new Map(mine.map((r) => [r.id, r]));
  return {
    open: summaries.filter((s) => isOpen(s.status)).sort((x, y) => y.updated_at.localeCompare(x.updated_at)),
    drafts: summaries.filter((s) => s.status === "DRAFT"),
    recently_closed: summaries
      .filter((s) => s.status === "CLOSED")
      .sort((x, y) => (y.closed_at ?? "").localeCompare(x.closed_at ?? ""))
      .slice(0, 5)
      .map((s) => ({ ...s, rated: rated.some((r) => r.requestId === s.id && r.cycleNumber === s.cycle_number) })),
    last_messages: messages.map((m) => {
      const r = byId.get(m.requestId)!;
      return { id: m.id, request_id: r.id, reference: r.reference, sender: nameIn(names, m.senderId), created_at: m.createdAt.toISOString(), excerpt: m.body.slice(0, 140) };
    }),
  };
}

/** Export des demandes de la période — métadonnées uniquement, jamais le contenu des échanges. */
export async function exportRequestsCsv(call: LiveCall, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const p = parse(zPeriod, input);
  const filters: SQL[] = [ne(coachingRequest.status, "DRAFT"), gte(coachingRequest.submittedAt, new Date(p.from)), lte(coachingRequest.submittedAt, new Date(p.to))];
  if (p.coachId) filters.push(eq(coachingRequest.coachId, p.coachId));
  const rows = await db.select().from(coachingRequest).where(and(...filters)).orderBy(asc(coachingRequest.submittedAt));
  const ctx = await summarize(db, rows, a.user, new Date());
  const out = rows.map((r) => {
    const s = ctx.get(r.id)!.summary;
    return {
      reference: r.reference,
      sujet: r.subject,
      categorie: s.category?.name ?? "",
      apprenant: s.learner.full_name,
      coach: s.coach?.full_name ?? "",
      priorite: r.priority,
      statut: STATUS_LABELS[r.status],
      cycle: r.currentCycleNumber,
      soumise_le: iso(r.submittedAt),
      echeance: iso(r.dueAt),
      premiere_reponse: iso(r.firstResponseAt) ?? "",
      en_retard: s.sla?.is_overdue ? "oui" : "non",
      reponse_dans_les_delais: s.sla?.responded_on_time === null || s.sla === null ? "" : s.sla.responded_on_time ? "oui" : "non",
      cloturee_le: iso(r.closedAt) ?? "",
    };
  });
  await audit(db, { actor_id: a.user.id, action: "REPORT_EXPORTED", entity_type: "report", entity_id: null, reason: null, metadata: { from: p.from, to: p.to, rows: out.length } });
  return toCsv(out);
}

// ---------------------------------------------------------------- journal d'audit

/** Recherche libre : auteur, motif, ou libellé de l'entité (nom, référence, droit, affectation). */
function auditSearch(q: string): SQL {
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const namedUsers = db.select({ id: user.id }).from(user).where(ilike(user.name, pattern));
  return or(
    inArray(auditLog.actorId, namedUsers),
    ilike(auditLog.reason, pattern),
    and(eq(auditLog.entityType, "user"), inArray(auditLog.entityId, namedUsers)),
    and(eq(auditLog.entityType, "coaching_request"), inArray(auditLog.entityId, db.select({ id: coachingRequest.id }).from(coachingRequest).where(ilike(coachingRequest.reference, pattern)))),
    and(
      eq(auditLog.entityType, "coaching_entitlement"),
      inArray(auditLog.entityId, db.select({ id: coachingEntitlement.id }).from(coachingEntitlement).where(inArray(coachingEntitlement.learnerId, namedUsers))),
    ),
    and(
      eq(auditLog.entityType, "coach_assignment"),
      inArray(
        auditLog.entityId,
        db
          .select({ id: coachAssignment.id })
          .from(coachAssignment)
          .where(or(inArray(coachAssignment.learnerId, namedUsers), inArray(coachAssignment.coachId, namedUsers))),
      ),
    ),
  )!;
}

export async function listAuditLogs(call: LiveCall, input: unknown) {
  await authenticate(call, "ADMIN");
  const f = parse(
    z.object({
      action: z.string().max(60).optional(),
      entityType: z.string().max(60).optional(),
      actorId: z.string().optional(),
      q: z.string().trim().max(100).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(25),
    }),
    input ?? {},
  );
  const filters: SQL[] = [];
  if (f.action) filters.push(eq(auditLog.action, f.action));
  if (f.entityType) filters.push(eq(auditLog.entityType, f.entityType));
  if (f.actorId) filters.push(eq(auditLog.actorId, f.actorId));
  if (f.from) filters.push(gte(auditLog.createdAt, new Date(f.from)));
  if (f.to) filters.push(lte(auditLog.createdAt, new Date(f.to)));
  if (f.q) filters.push(auditSearch(f.q));
  const where = filters.length ? and(...filters) : undefined;

  const total = (await db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(where))[0]?.n ?? 0;
  const { page, pages } = pageOf(total, f.page, f.pageSize);
  const rows = await db.select().from(auditLog).where(where).orderBy(desc(auditLog.createdAt)).limit(f.pageSize).offset((page - 1) * f.pageSize);
  const labels = await entityLabels(rows);
  const names = await namesOf(db, rows.map((l) => l.actorId));
  const [actions, types] = await Promise.all([
    db.selectDistinct({ v: auditLog.action }).from(auditLog).orderBy(asc(auditLog.action)),
    db.selectDistinct({ v: auditLog.entityType }).from(auditLog).orderBy(asc(auditLog.entityType)),
  ]);
  return {
    items: rows.map((l) => ({
      id: l.id,
      actor_id: l.actorId,
      action: l.action,
      entity_type: l.entityType,
      entity_id: l.entityId,
      reason: l.reason,
      metadata: l.metadata,
      created_at: l.createdAt.toISOString(),
      actor_name: nameIn(names, l.actorId),
      entity_label: l.entityId ? (labels.get(`${l.entityType}:${l.entityId}`) ?? l.entityId) : null,
    })),
    total,
    page,
    pageSize: f.pageSize,
    pages,
    actions: actions.map((x) => x.v),
    entity_types: types.map((x) => x.v),
  };
}

/** Libellés lisibles des entités d'une page du journal (même règle que la simulation). */
async function entityLabels(rows: Array<typeof auditLog.$inferSelect>) {
  const idsOf = (type: string) => [...new Set(rows.filter((l) => l.entityType === type && l.entityId).map((l) => l.entityId!))];
  const out = new Map<string, string>();
  const userIds = idsOf("user");
  const requestIds = idsOf("coaching_request");
  const entIds = idsOf("coaching_entitlement");
  const asgIds = idsOf("coach_assignment");
  const [requests, ents, asgs] = await Promise.all([
    requestIds.length ? db.select({ id: coachingRequest.id, reference: coachingRequest.reference }).from(coachingRequest).where(inArray(coachingRequest.id, requestIds)) : [],
    entIds.length ? db.select({ id: coachingEntitlement.id, learnerId: coachingEntitlement.learnerId }).from(coachingEntitlement).where(inArray(coachingEntitlement.id, entIds)) : [],
    asgIds.length
      ? db.select({ id: coachAssignment.id, learnerId: coachAssignment.learnerId, coachId: coachAssignment.coachId }).from(coachAssignment).where(inArray(coachAssignment.id, asgIds))
      : [],
  ]);
  const names = await namesOf(db, [...userIds, ...ents.map((e) => e.learnerId), ...asgs.flatMap((x) => [x.learnerId, x.coachId])]);
  for (const id of userIds) out.set(`user:${id}`, nameIn(names, id));
  for (const r of requests) out.set(`coaching_request:${r.id}`, r.reference ?? r.id);
  for (const e of ents) out.set(`coaching_entitlement:${e.id}`, `Droit de ${nameIn(names, e.learnerId)}`);
  for (const x of asgs) out.set(`coach_assignment:${x.id}`, `${nameIn(names, x.learnerId)} → ${nameIn(names, x.coachId)}`);
  return out;
}
