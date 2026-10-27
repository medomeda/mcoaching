/**
 * Demandes de coaching (PRD §6.2, §7, §8, §9.7–9.10) sur PostgreSQL.
 * Chaque opération : session → rôle → politique d'accès → validation → transaction.
 * Toute écriture verrouille la ligne de la demande (`FOR UPDATE`) : les actions concurrentes
 * sur une même demande sont sérialisées et la machine à états s'applique au statut à jour.
 * Les horodatages d'une opération partagent le même `now` ; la colonne `seq` en fixe l'ordre.
 */
import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { AppError, businessRule, conflict, forbidden, notFound, validation } from "@/modules/core/errors";
import { PRIORITIES, REQUEST_STATUSES, type AppSettings, type CoachingRequest, type MessageIntent } from "@/modules/core/types";
import { parse, zReason, zText } from "@/modules/core/validation";
import { addWorkingMinutes } from "@/modules/deadlines/businessHours";
import { calendarOfPolicy, isDueSoon, type SlaState } from "@/modules/deadlines/sla";
import { checkSubmissionEligibility, INELIGIBILITY_MESSAGES } from "@/modules/entitlements/entitlements";
import {
  assertCanViewRequest,
  canActAsCoach,
  canActAsLearner,
  canViewNotes,
  canWriteNotes,
  type Actor,
} from "@/modules/permissions/policies";
import { AWAITING_COACH_STATUSES, isOpen, planTransition, type RequestAction } from "@/modules/requests/stateMachine";
import type { RequestSummary } from "../api/views";
import { newId, randomToken } from "../crypto";
import { privateFiles } from "../files/diskStore";
import { validateUpload, type UploadInput, type ValidatedFile } from "../files/validation";
import { db } from "../pg/client";
import {
  auditLog,
  coachAbsence,
  coachAssignment,
  coachingCategory,
  coachingEntitlement,
  coachingMessage,
  coachingNote,
  coachingQuotaLedger,
  coachingRating,
  coachingRequest,
  coachingRequestCycle,
  messageAttachment,
  requestAssignmentHistory,
  requestRead,
  requestStatusHistory,
  sequence,
  servicePolicy,
  user,
} from "../pg/schema";
import { allHolidays, assertActiveCategory, getAppSettings, policyAt } from "./config";
import { authenticate, type LiveAuthed, type LiveCall } from "./context";
import { audit, getUser, nameIn, namesOf, notify, pageOf, type Tx, type UserRowDb } from "./helpers";
import { iso, toAssignment, toDomainUser, toEntitlement, toLedgerEntry, toRequest } from "./mappers";
import { slaResolver } from "./sla";

type ReqRow = typeof coachingRequest.$inferSelect;
type CycleRow = typeof coachingRequestCycle.$inferSelect;
type UploadsArg = unknown[] | null | undefined;
type StoredUpload = ValidatedFile & { key: string };

// ---------------------------------------------------------------- utilitaires

/** Contrôle la forme des fichiers reçus (le contenu binaire est décodé par la route RPC). */
function parseUploads(uploads: UploadsArg): UploadInput[] {
  if (uploads == null) return [];
  if (!Array.isArray(uploads)) throw validation("Pièces jointes invalides.");
  return uploads.map((u) => {
    const f = u as { name?: unknown; data?: unknown };
    if (typeof f?.name !== "string" || !(f.data instanceof ArrayBuffer)) throw validation("Pièce jointe invalide.");
    return { name: f.name, data: f.data };
  });
}

/**
 * Valide puis écrit les fichiers dans le stockage privé AVANT la transaction ;
 * si l'opération échoue, les fichiers déjà écrits sont supprimés.
 */
async function withStoredFiles<T>(uploads: UploadsArg, fn: (stored: StoredUpload[]) => Promise<T>): Promise<T> {
  const list = parseUploads(uploads);
  const settings = await getAppSettings(db);
  if (list.length > settings.attachment_max_files_per_message) {
    throw validation(`Vous pouvez joindre au maximum ${settings.attachment_max_files_per_message} fichiers.`);
  }
  const validated = list.map((f) => validateUpload(f, settings));
  const stored: StoredUpload[] = [];
  try {
    for (const v of validated) {
      const key = `att_${randomToken(16)}`;
      await privateFiles.put(key, v.data);
      stored.push({ ...v, key });
    }
    return await fn(stored);
  } catch (e) {
    for (const f of stored) await privateFiles.delete(f.key).catch(() => undefined);
    throw e;
  }
}

async function attachFiles(tx: Tx, requestId: string, messageId: string | null, uploaderId: string, stored: StoredUpload[], now: Date) {
  if (stored.length === 0) return;
  await tx.insert(messageAttachment).values(
    stored.map((f) => ({
      id: newId("att"),
      messageId,
      requestId,
      uploadedBy: uploaderId,
      originalFilename: f.originalName,
      storageKey: f.key,
      mimeType: f.mime,
      sizeBytes: f.size,
      createdAt: now,
    })),
  );
}

async function lockRequest(tx: Tx, id: string): Promise<ReqRow> {
  const [r] = await tx.select().from(coachingRequest).where(eq(coachingRequest.id, String(id))).for("update");
  if (!r) throw notFound("Demande introuvable.");
  return r;
}

async function readRequest(tx: Tx, id: string): Promise<ReqRow> {
  const [r] = await tx.select().from(coachingRequest).where(eq(coachingRequest.id, String(id)));
  if (!r) throw notFound("Demande introuvable.");
  return r;
}

async function currentCycle(tx: Tx, req: ReqRow): Promise<CycleRow | undefined> {
  const [c] = await tx
    .select()
    .from(coachingRequestCycle)
    .where(and(eq(coachingRequestCycle.requestId, req.id), eq(coachingRequestCycle.cycleNumber, req.currentCycleNumber)));
  return c;
}

/** Applique une action de la machine à états : historise chaque statut et met la ligne `req` à jour. */
async function applyTransition(
  tx: Tx,
  req: ReqRow,
  action: RequestAction,
  actorId: string | null,
  settings: AppSettings,
  now: Date,
  reason: string | null = null,
) {
  const steps = planTransition(req.status, action, { learnerFollowUpReopensProcessing: settings.learner_follow_up_reopens_processing });
  if (steps.length === 0) return;
  const cycle = await currentCycle(tx, req);
  let status = req.status;
  for (const next of steps) {
    await tx.insert(requestStatusHistory).values({
      id: newId("rsh"),
      requestId: req.id,
      cycleId: cycle?.id ?? null,
      oldStatus: status,
      newStatus: next,
      changedBy: actorId,
      reason,
      createdAt: now,
    });
    status = next;
  }
  await tx.update(coachingRequest).set({ status, updatedAt: now }).where(eq(coachingRequest.id, req.id));
  req.status = status;
  req.updatedAt = now;
}

async function markRead(tx: Tx, requestId: string, userId: string, now: Date) {
  await tx
    .insert(requestRead)
    .values({ requestId, userId, lastReadAt: now })
    .onConflictDoUpdate({ target: [requestRead.requestId, requestRead.userId], set: { lastReadAt: now } });
}

async function systemMessage(tx: Tx, req: ReqRow, cycleId: string, body: string, now: Date) {
  await tx.insert(coachingMessage).values({ id: newId("msg"), requestId: req.id, cycleId, senderId: null, kind: "SYSTEM", intent: "MESSAGE", body, createdAt: now });
}

/** Référence annuelle COA-AAAA-NNNNNN, compteur incrémenté atomiquement. */
async function nextRequestReference(tx: Tx, now: Date) {
  const year = now.getUTCFullYear();
  const [row] = await tx
    .insert(sequence)
    .values({ name: `request_ref_${year}`, value: 1 })
    .onConflictDoUpdate({ target: sequence.name, set: { value: sql`${sequence.value} + 1` } })
    .returning();
  return `COA-${year}-${String(row!.value).padStart(6, "0")}`;
}

async function findUserRow(tx: Tx, id: string | null): Promise<UserRowDb | undefined> {
  if (!id) return undefined;
  const [u] = await tx.select().from(user).where(eq(user.id, id));
  return u;
}

// ---------------------------------------------------------------- vues

const AWAITING = AWAITING_COACH_STATUSES as readonly string[];

export interface SummaryCtx {
  summary: RequestSummary;
  /** Dernier message humain : sert à « en attente de réponse ». */
  lastSenderId: string | null | undefined;
  coachRow: UserRowDb | undefined;
  coachAbsent: boolean;
  sla: SlaState | null;
}

/** Résumés de demandes (même forme que `requestSummary`), calculés par lot. */
export async function summarize(tx: Tx, rows: ReqRow[], viewer: { id: string }, now: Date): Promise<Map<string, SummaryCtx>> {
  const out = new Map<string, SummaryCtx>();
  if (rows.length === 0) return out;
  const ids = rows.map((r) => r.id);
  const userIds = [...new Set(rows.flatMap((r) => [r.learnerId, r.coachId]).filter((x): x is string => !!x))];
  const [users, categories, lastMessages, unread, sla, absences] = await Promise.all([
    tx.select().from(user).where(inArray(user.id, userIds)),
    tx.select({ id: coachingCategory.id, name: coachingCategory.name }).from(coachingCategory),
    tx
      .selectDistinctOn([coachingMessage.requestId], { requestId: coachingMessage.requestId, createdAt: coachingMessage.createdAt, senderId: coachingMessage.senderId })
      .from(coachingMessage)
      .where(and(inArray(coachingMessage.requestId, ids), eq(coachingMessage.kind, "USER")))
      .orderBy(coachingMessage.requestId, desc(coachingMessage.createdAt), desc(coachingMessage.seq)),
    tx
      .select({ requestId: coachingMessage.requestId, n: sql<number>`count(*)::int` })
      .from(coachingMessage)
      .leftJoin(requestRead, and(eq(requestRead.requestId, coachingMessage.requestId), eq(requestRead.userId, viewer.id)))
      .where(
        and(
          inArray(coachingMessage.requestId, ids),
          eq(coachingMessage.kind, "USER"),
          sql`${coachingMessage.senderId} is distinct from ${viewer.id}`,
          or(isNull(requestRead.lastReadAt), gt(coachingMessage.createdAt, requestRead.lastReadAt)),
        ),
      )
      .groupBy(coachingMessage.requestId),
    slaResolver(tx, rows, now),
    tx
      .select({ coachId: coachAbsence.coachId })
      .from(coachAbsence)
      .where(and(isNull(coachAbsence.cancelledAt), lte(coachAbsence.startsAt, now), gt(coachAbsence.endsAt, now))),
  ]);
  const userOf = new Map(users.map((u) => [u.id, u]));
  const categoryOf = new Map(categories.map((c) => [c.id, c]));
  const lastOf = new Map(lastMessages.map((m) => [m.requestId, m]));
  const unreadOf = new Map(unread.map((u) => [u.requestId, u.n]));
  const absent = new Set(absences.map((a) => a.coachId));

  for (const r of rows) {
    const s = sla(r);
    const coachRow = r.coachId ? userOf.get(r.coachId) : undefined;
    const category = categoryOf.get(r.categoryId);
    const last = lastOf.get(r.id);
    out.set(r.id, {
      lastSenderId: last?.senderId,
      coachRow,
      coachAbsent: !!coachRow && absent.has(coachRow.id),
      sla: s,
      summary: {
        id: r.id,
        reference: r.reference,
        subject: r.subject,
        status: r.status,
        priority: r.priority,
        category: category ? { id: category.id, name: category.name } : null,
        learner: { id: r.learnerId, full_name: userOf.get(r.learnerId)?.name ?? "Utilisateur inconnu" },
        coach: coachRow ? { id: coachRow.id, full_name: coachRow.name, status: coachRow.status } : null,
        created_at: r.createdAt.toISOString(),
        submitted_at: iso(r.submittedAt),
        first_response_at: iso(r.firstResponseAt),
        due_at: iso(r.dueAt),
        closed_at: iso(r.closedAt),
        updated_at: r.updatedAt.toISOString(),
        cycle_number: r.currentCycleNumber,
        last_message_at: last ? last.createdAt.toISOString() : null,
        unread: unreadOf.get(r.id) ?? 0,
        sla: s
          ? {
              is_overdue: s.isOverdue,
              due_soon: isDueSoon(s),
              awaiting_first_response: s.awaitingFirstResponse,
              elapsed_minutes: s.elapsedMinutes,
              target_minutes: s.targetMinutes,
              overdue_minutes: s.overdueMinutes,
              responded_on_time: s.respondedOnTime,
              ratio: s.ratio,
            }
          : null,
      },
    });
  }
  return out;
}

/** Interventions administrateur : retard, coach suspendu/absent, aucun coach (même règle que la simulation). */
export function needsAttention(r: ReqRow, c: SummaryCtx): string[] {
  const reasons: string[] = [];
  if (!isOpen(r.status)) return reasons;
  if (c.summary.sla?.is_overdue) reasons.push("En retard");
  if (!r.coachId) reasons.push("Aucun coach");
  if (c.coachRow && c.coachRow.status !== "ACTIVE") reasons.push("Coach suspendu");
  if (c.coachAbsent && AWAITING.includes(r.status)) reasons.push("Coach absent");
  return reasons;
}

function awaitingReply(r: ReqRow, c: SummaryCtx): boolean {
  if (!AWAITING.includes(r.status)) return false;
  return c.lastSenderId === undefined || c.lastSenderId === r.learnerId;
}

// ---------------------------------------------------------------- actions autorisées (affichage)

export type UiAction =
  | "EDIT_DRAFT"
  | "SUBMIT"
  | "ABANDON"
  | "CANCEL"
  | "MESSAGE"
  | "CLARIFY"
  | "FINAL_RESPONSE"
  | "TAKE_CHARGE"
  | "CLOSE"
  | "RATE"
  | "NOTE"
  | "REASSIGN"
  | "REOPEN"
  | "RECALCULATE_DUE"
  | "SET_PRIORITY"
  | "REFUND"
  | "NUDGE_COACH";

function can(fn: () => unknown): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

/** Même calcul que `allowedActions` (simulation), à partir d'un contexte préchargé. */
function allowedActions(
  actor: Actor,
  req: CoachingRequest,
  ctx: { settings: AppSettings; cycle: CycleRow | undefined; currentCycleRated: boolean; quotaNetConsumed: number },
): UiAction[] {
  const out: UiAction[] = [];
  const opts = { learnerFollowUpReopensProcessing: ctx.settings.learner_follow_up_reopens_processing };
  const s = req.status;
  if (canActAsLearner(actor, req)) {
    if (s === "DRAFT") out.push("EDIT_DRAFT", "SUBMIT", "ABANDON");
    if (s === "SUBMITTED") out.push("CANCEL");
    if (isOpen(s) && can(() => planTransition(s, "LEARNER_MESSAGE", opts))) out.push("MESSAGE");
    if (s === "RESPONSE_PROVIDED" && ctx.settings.learner_can_close) out.push("CLOSE");
    if (s === "CLOSED" && ctx.cycle && !ctx.currentCycleRated) out.push("RATE");
  }
  if (canActAsCoach(actor, req) && isOpen(s)) {
    if (s === "SUBMITTED" || s === "WAITING_FOR_COACH") out.push("TAKE_CHARGE");
    if (can(() => planTransition(s, "COACH_MESSAGE", opts))) out.push("MESSAGE");
    if (can(() => planTransition(s, "REQUEST_CLARIFICATION", opts))) out.push("CLARIFY");
    if (can(() => planTransition(s, "FINAL_RESPONSE", opts))) out.push("FINAL_RESPONSE");
    if (s === "RESPONSE_PROVIDED") out.push("CLOSE");
    out.push("SET_PRIORITY");
  }
  if (canWriteNotes(actor, req) && s !== "DRAFT") out.push("NOTE");
  if (actor.role === "ADMIN" && s !== "DRAFT") {
    if (isOpen(s)) out.push("REASSIGN", "SET_PRIORITY", "NUDGE_COACH");
    if (s === "RESPONSE_PROVIDED") out.push("CLOSE");
    if (s === "CLOSED") out.push("REOPEN");
    if (isOpen(s) && ctx.cycle && !ctx.cycle.firstResponseAt) out.push("RECALCULATE_DUE");
    if (ctx.quotaNetConsumed > 0) out.push("REFUND");
  }
  return out;
}

// ---------------------------------------------------------------- éligibilité (apprenant)

/** Contexte d'éligibilité ; avec `lock`, le droit en vigueur est verrouillé (soumission). */
async function eligibilityContext(tx: Tx, learner: UserRowDb, now: Date, lock = false) {
  const [assignment] = await tx
    .select()
    .from(coachAssignment)
    .where(and(eq(coachAssignment.learnerId, learner.id), eq(coachAssignment.status, "ACTIVE")));
  const coach = assignment ? await findUserRow(tx, assignment.coachId) : undefined;
  const entQuery = tx
    .select()
    .from(coachingEntitlement)
    .where(and(eq(coachingEntitlement.learnerId, learner.id), isNull(coachingEntitlement.supersededAt)));
  const [entRow] = await (lock ? entQuery.for("update") : entQuery);
  const ent = entRow ? toEntitlement(entRow) : undefined;
  const ledger = ent ? (await tx.select().from(coachingQuotaLedger).where(eq(coachingQuotaLedger.entitlementId, ent.id))).map(toLedgerEntry) : [];
  const elig = checkSubmissionEligibility({
    learner: toDomainUser(learner),
    entitlement: ent,
    ledger,
    assignment: assignment ? toAssignment(assignment) : undefined,
    coach: coach ? toDomainUser(coach) : undefined,
    now,
  });
  return { elig, ent, coach };
}

export async function myEligibility(call: LiveCall) {
  const a = await authenticate(call, "LEARNER");
  const now = new Date();
  const [{ elig, ent, coach }, settings] = await Promise.all([eligibilityContext(db, a.user, now), getAppSettings(db)]);
  return {
    ...elig,
    messages: elig.reasons.map((r) => INELIGIBILITY_MESSAGES[r]),
    coach: coach ? { id: coach.id, full_name: coach.name } : null,
    entitlement: ent ?? null,
    attachment_settings: {
      max_files: settings.attachment_max_files_per_message,
      max_size_bytes: settings.attachment_max_size_bytes,
      allowed_extensions: settings.attachment_allowed_extensions,
    },
  };
}

// ---------------------------------------------------------------- liste

const zList = z.object({
  q: z.string().trim().max(100).optional(),
  statuses: z.array(z.enum(REQUEST_STATUSES)).optional(),
  view: z.enum(["all", "todo", "awaiting_reply", "in_progress", "waiting_learner", "overdue", "due_soon", "closed", "open", "drafts", "needs_attention"]).default("all"),
  coachId: z.string().optional(),
  learnerId: z.string().optional(),
  categoryId: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sort: z.enum(["submitted_desc", "submitted_asc", "due_asc", "updated_desc", "priority_desc"]).default("updated_desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

const PRIORITY_RANK = { URGENT: 3, HIGH: 2, NORMAL: 1 } as const;

export async function listRequests(call: LiveCall, input: unknown) {
  const a = await authenticate(call);
  const f = parse(zList, input ?? {});
  const now = new Date();
  const r = coachingRequest;

  // Cloisonnement par rôle d'abord ; les filtres ne peuvent qu'en réduire le périmètre.
  const filters: SQL[] = [];
  if (a.actor.role === "LEARNER") filters.push(eq(r.learnerId, a.user.id));
  else if (a.actor.role === "COACH") filters.push(eq(r.coachId, a.user.id), ne(r.status, "DRAFT"));
  else {
    filters.push(ne(r.status, "DRAFT")); // les brouillons restent privés à l'apprenant
    if (f.coachId) filters.push(eq(r.coachId, f.coachId));
  }
  if (f.learnerId) filters.push(eq(r.learnerId, f.learnerId));
  if (f.q) {
    const pattern = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    filters.push(or(ilike(r.reference, pattern), ilike(r.subject, pattern))!);
  }
  if (f.statuses?.length) filters.push(inArray(r.status, f.statuses));
  if (f.categoryId) filters.push(eq(r.categoryId, f.categoryId));
  if (f.priority) filters.push(eq(r.priority, f.priority));
  const submittedOrCreated = sql`coalesce(${r.submittedAt}, ${r.createdAt})`;
  if (f.from) filters.push(gte(submittedOrCreated, new Date(f.from)));
  if (f.to) filters.push(lte(submittedOrCreated, new Date(f.to)));
  // Vues sans calcul d'échéance : traduites en SQL.
  const statusView: Partial<Record<typeof f.view, SQL>> = {
    todo: inArray(r.status, [...AWAITING_COACH_STATUSES]),
    in_progress: eq(r.status, "IN_PROGRESS"),
    waiting_learner: eq(r.status, "WAITING_FOR_LEARNER"),
    closed: eq(r.status, "CLOSED"),
    open: inArray(r.status, REQUEST_STATUSES.filter(isOpen)),
    drafts: eq(r.status, "DRAFT"),
  };
  const sv = statusView[f.view];
  if (sv) filters.push(sv);

  const rows = await db.select().from(r).where(and(...filters));
  const ctx = await summarize(db, rows, a.user, now);
  const kept = rows.filter((req) => {
    const c = ctx.get(req.id)!;
    switch (f.view) {
      case "awaiting_reply":
        return awaitingReply(req, c);
      case "overdue":
        return !!c.summary.sla?.is_overdue;
      case "due_soon":
        return !!c.summary.sla?.due_soon;
      case "needs_attention":
        return needsAttention(req, c).length > 0;
      default:
        return true;
    }
  });

  const key = (req: ReqRow) => (req.submittedAt ?? req.createdAt).toISOString();
  const due = (req: ReqRow) => req.dueAt?.toISOString() ?? "9999";
  const sorters: Record<typeof f.sort, (x: ReqRow, y: ReqRow) => number> = {
    submitted_desc: (x, y) => key(y).localeCompare(key(x)),
    submitted_asc: (x, y) => key(x).localeCompare(key(y)),
    due_asc: (x, y) => due(x).localeCompare(due(y)),
    updated_desc: (x, y) => y.updatedAt.getTime() - x.updatedAt.getTime(),
    priority_desc: (x, y) => PRIORITY_RANK[y.priority] - PRIORITY_RANK[x.priority] || due(x).localeCompare(due(y)),
  };
  kept.sort(sorters[f.sort]);
  const { page, pages } = pageOf(kept.length, f.page, f.pageSize);
  return {
    items: kept.slice((page - 1) * f.pageSize, page * f.pageSize).map((req) => {
      const c = ctx.get(req.id)!;
      return { ...c.summary, attention: a.actor.role === "ADMIN" ? needsAttention(req, c) : [] };
    }),
    total: kept.length,
    page,
    pageSize: f.pageSize,
    pages,
  };
}

// ---------------------------------------------------------------- détail

function attachmentView(x: typeof messageAttachment.$inferSelect) {
  return { id: x.id, filename: x.originalFilename, mime_type: x.mimeType, size_bytes: x.sizeBytes, created_at: x.createdAt.toISOString(), uploaded_by: x.uploadedBy };
}

export async function getRequestDetail(call: LiveCall, requestId: string) {
  const a = await authenticate(call);
  assertCanViewRequest(a.actor, toRequest(await readRequest(db, requestId)));

  // Écritures liées à la consultation : accusé de lecture, « enregistrement initial » par le coach
  // responsable, journalisation de la consultation administrative (1×/jour/admin/demande).
  await db.transaction(async (tx) => {
    const now = new Date();
    const req = await lockRequest(tx, requestId);
    const [read] = await tx.select().from(requestRead).where(and(eq(requestRead.requestId, req.id), eq(requestRead.userId, a.user.id)));
    const [newer] = await tx
      .select({ id: coachingMessage.id })
      .from(coachingMessage)
      .where(and(eq(coachingMessage.requestId, req.id), read ? gt(coachingMessage.createdAt, read.lastReadAt) : undefined))
      .limit(1);
    if (!read || newer) await markRead(tx, req.id, a.user.id, now);
    if (req.status === "SUBMITTED" && canActAsCoach(a.actor, toRequest(req))) {
      await applyTransition(tx, req, "ACKNOWLEDGE", a.user.id, await getAppSettings(tx), now, "Première consultation par le coach responsable");
    }
    if (a.actor.role === "ADMIN") {
      const dayStart = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
      const [already] = await tx
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(and(eq(auditLog.action, "REQUEST_VIEWED_BY_ADMIN"), eq(auditLog.actorId, a.user.id), eq(auditLog.entityId, req.id), gte(auditLog.createdAt, dayStart)))
        .limit(1);
      if (!already) await audit(tx, { actor_id: a.user.id, action: "REQUEST_VIEWED_BY_ADMIN", entity_type: "coaching_request", entity_id: req.id, reason: "Supervision" });
    }
  });

  const now = new Date();
  const req = await readRequest(db, requestId);
  const domainReq = toRequest(req);
  const [ctx, settings, cycles, atts, messages, history, assignHistory, ratings, ledger] = await Promise.all([
    summarize(db, [req], a.user, now),
    getAppSettings(db),
    db.select().from(coachingRequestCycle).where(eq(coachingRequestCycle.requestId, req.id)).orderBy(asc(coachingRequestCycle.cycleNumber)),
    db.select().from(messageAttachment).where(eq(messageAttachment.requestId, req.id)),
    db.select().from(coachingMessage).where(eq(coachingMessage.requestId, req.id)).orderBy(asc(coachingMessage.createdAt), asc(coachingMessage.seq)),
    db.select().from(requestStatusHistory).where(eq(requestStatusHistory.requestId, req.id)).orderBy(asc(requestStatusHistory.createdAt), asc(requestStatusHistory.seq)),
    db.select().from(requestAssignmentHistory).where(eq(requestAssignmentHistory.requestId, req.id)).orderBy(asc(requestAssignmentHistory.createdAt)),
    db.select().from(coachingRating).where(eq(coachingRating.requestId, req.id)),
    db.select().from(coachingQuotaLedger).where(eq(coachingQuotaLedger.requestId, req.id)),
  ]);
  const showNotes = canViewNotes(a.actor, domainReq);
  const notes = showNotes
    ? await db.select().from(coachingNote).where(eq(coachingNote.requestId, req.id)).orderBy(desc(coachingNote.createdAt))
    : [];
  const policies = cycles.length
    ? await db.select().from(servicePolicy).where(inArray(servicePolicy.id, [...new Set(cycles.map((c) => c.policyId))]))
    : [];
  const senderIds = [...new Set(messages.map((m) => m.senderId).filter((x): x is string => !!x))];
  const senders = senderIds.length
    ? await db.select({ id: user.id, name: user.name, role: user.role }).from(user).where(inArray(user.id, senderIds))
    : [];
  const names = await namesOf(db, [
    ...notes.map((n) => n.authorId),
    ...history.map((h) => h.changedBy),
    ...assignHistory.flatMap((h) => [h.oldCoachId, h.newCoachId, h.changedBy]),
    ...cycles.flatMap((c) => [c.closedBy, c.assignedCoachId, c.reopenedBy]),
  ]);

  const cycleNumberOf = new Map(cycles.map((c) => [c.id, c.cycleNumber]));
  const senderOf = new Map(senders.map((s) => [s.id, s]));
  const policyOf = new Map(policies.map((p) => [p.id, p]));
  const cycle = cycles.find((c) => c.cycleNumber === req.currentCycleNumber);
  const ratingsVisible = a.actor.role === "ADMIN" || a.actor.role === "LEARNER" || settings.coach_can_view_ratings;
  const quotaNetConsumed = -ledger.filter((e) => e.entryType !== "CORRECTION").reduce((x, e) => x + e.quantity, 0);
  const c = ctx.get(req.id)!;

  return {
    ...c.summary,
    description: req.description,
    category_id: req.categoryId,
    category_name: c.summary.category?.name ?? "—",
    sla_detail: c.sla,
    attachments: atts.filter((x) => x.messageId === null).map(attachmentView),
    messages: messages.map((m) => {
      const sender = m.senderId ? senderOf.get(m.senderId) : undefined;
      return {
        id: m.id,
        kind: m.kind,
        intent: m.intent,
        body: m.body,
        created_at: m.createdAt.toISOString(),
        cycle_number: cycleNumberOf.get(m.cycleId) ?? 1,
        sender: sender ? { id: sender.id, full_name: sender.name, role: sender.role } : null,
        attachments: atts.filter((x) => x.messageId === m.id).map(attachmentView),
      };
    }),
    notes: showNotes ? notes.map((n) => ({ id: n.id, body: n.body, created_at: n.createdAt.toISOString(), author: nameIn(names, n.authorId) })) : null,
    status_history: history.map((h) => ({
      id: h.id,
      request_id: h.requestId,
      cycle_id: h.cycleId,
      old_status: h.oldStatus,
      new_status: h.newStatus,
      changed_by: h.changedBy,
      reason: h.reason,
      created_at: h.createdAt.toISOString(),
      changed_by_name: nameIn(names, h.changedBy),
      cycle_number: h.cycleId ? (cycleNumberOf.get(h.cycleId) ?? null) : null,
    })),
    assignment_history: assignHistory.map((h) => ({
      id: h.id,
      request_id: h.requestId,
      cycle_id: h.cycleId,
      old_coach_id: h.oldCoachId,
      new_coach_id: h.newCoachId,
      changed_by: h.changedBy,
      reason: h.reason,
      created_at: h.createdAt.toISOString(),
      old_coach_name: h.oldCoachId ? nameIn(names, h.oldCoachId) : null,
      new_coach_name: nameIn(names, h.newCoachId),
      changed_by_name: nameIn(names, h.changedBy),
    })),
    cycles: cycles.map((cy) => {
      const rating = ratings.find((x) => x.cycleId === cy.id);
      return {
        cycle_number: cy.cycleNumber,
        started_at: cy.startedAt.toISOString(),
        closed_at: iso(cy.closedAt),
        closed_by_name: cy.closedBy ? nameIn(names, cy.closedBy) : null,
        due_at: cy.dueAt.toISOString(),
        first_response_at: iso(cy.firstResponseAt),
        assigned_coach_name: cy.assignedCoachId ? nameIn(names, cy.assignedCoachId) : null,
        reopened_by_name: cy.reopenedBy ? nameIn(names, cy.reopenedBy) : null,
        reopen_reason: cy.reopenReason,
        policy_target_hours: (policyOf.get(cy.policyId)?.responseTargetWorkingMinutes ?? 0) / 60,
        rating: rating && ratingsVisible ? { score: rating.score, comment: rating.comment, created_at: rating.createdAt.toISOString() } : null,
      };
    }),
    allowed_actions: allowedActions(a.actor, domainReq, {
      settings,
      cycle,
      currentCycleRated: !!cycle && ratings.some((x) => x.cycleId === cycle.id),
      quotaNetConsumed,
    }),
    settings: {
      learner_can_close: settings.learner_can_close,
      max_files: settings.attachment_max_files_per_message,
      max_size_bytes: settings.attachment_max_size_bytes,
      allowed_extensions: settings.attachment_allowed_extensions,
    },
  };
}

// ---------------------------------------------------------------- brouillons & soumission (apprenant)

const zDraft = z.object({
  category_id: z.string().min(1, "Sélectionnez une catégorie."),
  subject: zText(5, 150, "Le sujet"),
  description: zText(20, 5000, "La description"),
});

async function lockOwnRequest(tx: Tx, a: LiveAuthed, id: string) {
  const req = await lockRequest(tx, id);
  if (!canActAsLearner(a.actor, toRequest(req))) throw forbidden("Vous n’avez pas accès à cette demande.");
  return req;
}

export async function createDraft(call: LiveCall, input: unknown, uploads?: UploadsArg) {
  const a = await authenticate(call, "LEARNER");
  const data = parse(zDraft, input);
  return withStoredFiles(uploads, (stored) => db.transaction(async (tx) => {
    await assertActiveCategory(tx, data.category_id);
    const now = new Date();
    const id = newId("req");
    await tx.insert(coachingRequest).values({
      id,
      learnerId: a.user.id,
      categoryId: data.category_id,
      subject: data.subject,
      description: data.description,
      priority: "NORMAL",
      status: "DRAFT",
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(requestStatusHistory).values({ id: newId("rsh"), requestId: id, oldStatus: null, newStatus: "DRAFT", changedBy: a.user.id, createdAt: now });
    await attachFiles(tx, id, null, a.user.id, stored, now);
    return { id };
  }));
}

export async function updateDraft(call: LiveCall, requestId: string, input: unknown, uploads?: UploadsArg) {
  const a = await authenticate(call, "LEARNER");
  const data = parse(zDraft.extend({ removeAttachmentIds: z.array(z.string()).default([]) }), input);
  let removedKeys: string[] = [];
  const res = await withStoredFiles(uploads, (stored) => db.transaction(async (tx) => {
    const req = await lockOwnRequest(tx, a, requestId);
    if (req.status !== "DRAFT") throw businessRule("Seul un brouillon peut être modifié.");
    await assertActiveCategory(tx, data.category_id);
    await tx
      .update(coachingRequest)
      .set({ categoryId: data.category_id, subject: data.subject, description: data.description, updatedAt: new Date() })
      .where(eq(coachingRequest.id, req.id));
    // Retrait de pièces jointes d'un brouillon non soumis (jamais partagées).
    if (data.removeAttachmentIds.length) {
      const removed = await tx
        .delete(messageAttachment)
        .where(and(eq(messageAttachment.requestId, req.id), isNull(messageAttachment.messageId), inArray(messageAttachment.id, data.removeAttachmentIds)))
        .returning({ key: messageAttachment.storageKey });
      removedKeys = removed.map((x) => x.key);
    }
    const now = new Date();
    await attachFiles(tx, req.id, null, a.user.id, stored, now);
    const settings = await getAppSettings(tx);
    const [counted] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(messageAttachment)
      .where(and(eq(messageAttachment.requestId, req.id), isNull(messageAttachment.messageId)));
    const n = counted?.n ?? 0;
    if (n > settings.attachment_max_files_per_message) {
      throw validation(`Au maximum ${settings.attachment_max_files_per_message} fichiers par demande.`);
    }
    return { id: req.id };
  }));
  // Fichiers retirés : supprimés du disque une fois la transaction validée.
  for (const k of removedKeys) await privateFiles.delete(k).catch(() => undefined);
  return res;
}

export async function abandonDraft(call: LiveCall, requestId: string) {
  const a = await authenticate(call, "LEARNER");
  await db.transaction(async (tx) => {
    const req = await lockOwnRequest(tx, a, requestId);
    await applyTransition(tx, req, "ABANDON", a.user.id, await getAppSettings(tx), new Date(), "Brouillon abandonné");
  });
}

/**
 * Soumission atomique (PRD §6.2 étapes 8–14, REC-01/02/03/20) : contrôles relus sous verrou
 * (demande puis droit), consommation unique (clé d'idempotence unique en base), échéance figée.
 */
export async function submitRequest(call: LiveCall, requestId: string, input: unknown) {
  const a = await authenticate(call, "LEARNER");
  const data = parse(z.object({ idempotencyKey: z.string().min(8).max(100) }), input);
  return db.transaction(async (tx) => {
    const req = await lockOwnRequest(tx, a, requestId);
    if (req.status !== "DRAFT") {
      // Répétition de la même opération : on renvoie le résultat sans rien consommer.
      if (req.submitIdempotencyKey === data.idempotencyKey) return { id: req.id, reference: req.reference, due_at: iso(req.dueAt), replayed: true };
      throw conflict("Cette demande a déjà été soumise.");
    }
    await assertActiveCategory(tx, req.categoryId);
    const now = new Date();
    const learner = await getUser(tx, a.user.id);
    const { elig, ent, coach } = await eligibilityContext(tx, learner, now, true);
    if (!elig.ok) throw businessRule(elig.reasons.map((r) => INELIGIBILITY_MESSAGES[r]).join(" "));

    const settings = await getAppSettings(tx);
    const policy = await policyAt(tx, now);
    const due = addWorkingMinutes(now, policy.response_target_working_minutes, calendarOfPolicy(policy, await allHolidays(tx)));
    const reference = await nextRequestReference(tx, now);
    const cycleId = newId("cyc");

    await tx
      .update(coachingRequest)
      .set({ reference, coachId: coach!.id, submittedAt: now, dueAt: due, currentCycleNumber: 1, submitIdempotencyKey: data.idempotencyKey, updatedAt: now })
      .where(eq(coachingRequest.id, req.id));
    Object.assign(req, { reference, coachId: coach!.id, submittedAt: now, dueAt: due, currentCycleNumber: 1 });
    await tx.insert(coachingRequestCycle).values({
      id: cycleId,
      requestId: req.id,
      cycleNumber: 1,
      startedAt: now,
      assignedCoachId: coach!.id,
      dueAt: due,
      policyId: policy.id,
      createdAt: now,
    });
    await applyTransition(tx, req, "SUBMIT", learner.id, settings, now);

    if (ent?.quota_enabled) {
      await tx.insert(coachingQuotaLedger).values({
        id: newId("qle"),
        learnerId: learner.id,
        entitlementId: ent.id,
        requestId: req.id,
        entryType: "CONSUME",
        quantity: -1,
        createdBy: learner.id,
        createdAt: now,
        idempotencyKey: `submit:${req.id}`,
      });
    }
    // Accusé de réception automatique : message SYSTÈME, jamais compté comme première réponse (REC-05).
    await systemMessage(
      tx,
      req,
      cycleId,
      `Demande ${reference} bien reçue. Votre coach dispose d’un délai cible de ${policy.response_target_working_minutes / 60} heures ouvrées pour vous apporter une première réponse.`,
      now,
    );
    await markRead(tx, req.id, learner.id, now);

    await notify(tx, {
      recipients: [coach!],
      type: "REQUEST_SUBMITTED",
      title: `Nouvelle demande ${reference}`,
      summary: `${learner.name} a soumis une nouvelle demande de coaching.`,
      requestId: req.id,
      eventKey: `SUBMITTED:${req.id}`,
    });
    await notify(tx, {
      recipients: [learner],
      type: "REQUEST_SUBMITTED",
      title: `Demande ${reference} enregistrée`,
      summary: `Votre demande a bien été transmise à ${coach!.name}.`,
      requestId: req.id,
      eventKey: `SUBMITTED_CONFIRM:${req.id}`,
    });
    return { id: req.id, reference, due_at: due.toISOString(), replayed: false };
  });
}

export async function cancelRequest(call: LiveCall, requestId: string, input: unknown) {
  const a = await authenticate(call, "LEARNER");
  const data = parse(z.object({ reason: zReason() }), input);
  await db.transaction(async (tx) => {
    const req = await lockOwnRequest(tx, a, requestId);
    await applyTransition(tx, req, "CANCEL", a.user.id, await getAppSettings(tx), new Date(), data.reason);
    const coach = await findUserRow(tx, req.coachId);
    await notify(tx, {
      recipients: coach ? [coach] : [],
      type: "NEW_MESSAGE",
      title: `Demande ${req.reference} annulée`,
      summary: "L’apprenant a annulé sa demande avant sa prise en charge.",
      requestId: req.id,
      eventKey: `CANCELLED:${req.id}`,
    });
  });
}

// ---------------------------------------------------------------- messagerie

const zMessage = z.object({
  body: zText(1, 5000, "Le message"),
  intent: z.enum(["MESSAGE", "CLARIFICATION_REQUEST", "FINAL_RESPONSE"]).default("MESSAGE"),
});

export async function sendMessage(call: LiveCall, requestId: string, input: unknown, uploads?: UploadsArg) {
  const a = await authenticate(call, "LEARNER", "COACH");
  const data = parse(zMessage, input);
  return withStoredFiles(uploads, (stored) => db.transaction(async (tx) => {
    const req = await lockRequest(tx, requestId);
    const domainReq = toRequest(req);
    assertCanViewRequest(a.actor, domainReq);
    const isCoach = a.actor.role === "COACH";
    if (isCoach && !canActAsCoach(a.actor, domainReq)) throw forbidden("Vous n’êtes plus le coach responsable de cette demande.");
    if (!isCoach && !canActAsLearner(a.actor, domainReq)) throw forbidden();
    if (!isOpen(req.status)) throw businessRule("Cette demande n’est pas ouverte : aucun message ne peut être ajouté.");
    if (!isCoach && data.intent !== "MESSAGE") throw forbidden();

    const action: RequestAction = !isCoach
      ? "LEARNER_MESSAGE"
      : data.intent === "CLARIFICATION_REQUEST"
        ? "REQUEST_CLARIFICATION"
        : data.intent === "FINAL_RESPONSE"
          ? "FINAL_RESPONSE"
          : "COACH_MESSAGE";
    const cycle = await currentCycle(tx, req);
    if (!cycle) throw new AppError("INTERNAL", "Cycle de traitement introuvable.");
    const now = new Date();
    await applyTransition(tx, req, action, a.user.id, await getAppSettings(tx), now);

    const msgId = newId("msg");
    await tx.insert(coachingMessage).values({
      id: msgId,
      requestId: req.id,
      cycleId: cycle.id,
      senderId: a.user.id,
      kind: "USER",
      intent: data.intent as MessageIntent,
      body: data.body,
      createdAt: now,
    });
    await attachFiles(tx, req.id, msgId, a.user.id, stored, now);
    await markRead(tx, req.id, a.user.id, now);

    // Première réponse humaine du coach (réponse, précision ou réponse finale).
    if (isCoach && !cycle.firstResponseAt) {
      await tx.update(coachingRequestCycle).set({ firstResponseAt: now, firstResponseBy: a.user.id }).where(eq(coachingRequestCycle.id, cycle.id));
      await tx.update(coachingRequest).set({ firstResponseAt: now }).where(eq(coachingRequest.id, req.id));
    }
    await tx.update(coachingRequest).set({ updatedAt: now }).where(eq(coachingRequest.id, req.id));

    const recipient = isCoach ? await getUser(tx, req.learnerId) : await findUserRow(tx, req.coachId);
    const kind = !isCoach ? "NEW_MESSAGE" : data.intent === "CLARIFICATION_REQUEST" ? "CLARIFICATION_REQUESTED" : "COACH_RESPONSE";
    const titles = {
      NEW_MESSAGE: `Nouveau message sur ${req.reference}`,
      CLARIFICATION_REQUESTED: `Votre coach demande des précisions (${req.reference})`,
      COACH_RESPONSE: data.intent === "FINAL_RESPONSE" ? `Réponse apportée à votre demande ${req.reference}` : `Nouvelle réponse de votre coach (${req.reference})`,
    } as const;
    await notify(tx, {
      recipients: recipient ? [recipient] : [],
      type: kind,
      title: titles[kind],
      summary: `${a.user.name} a ajouté un message${stored.length ? ` avec ${stored.length} pièce(s) jointe(s)` : ""}.`,
      requestId: req.id,
      eventKey: `MSG:${msgId}`,
    });
    return { id: msgId, status: req.status };
  }));
}

export async function takeCharge(call: LiveCall, requestId: string) {
  const a = await authenticate(call, "COACH");
  await db.transaction(async (tx) => {
    const req = await lockRequest(tx, requestId);
    if (!canActAsCoach(a.actor, toRequest(req))) throw forbidden("Vous n’êtes pas le coach responsable de cette demande.");
    await applyTransition(tx, req, "TAKE_CHARGE", a.user.id, await getAppSettings(tx), new Date());
  });
}

// ---------------------------------------------------------------- clôture

export async function closeRequest(call: LiveCall, requestId: string, input: unknown) {
  const a = await authenticate(call);
  const data = parse(z.object({ reason: z.string().trim().max(500).optional().nullable() }), input ?? {});
  await db.transaction(async (tx) => {
    const req = await lockRequest(tx, requestId);
    const domainReq = toRequest(req);
    assertCanViewRequest(a.actor, domainReq);
    const settings = await getAppSettings(tx);
    const allowed =
      a.actor.role === "ADMIN" || canActAsCoach(a.actor, domainReq) || (canActAsLearner(a.actor, domainReq) && settings.learner_can_close);
    if (!allowed) throw forbidden("Vous n’êtes pas autorisé à clôturer cette demande.");
    const cycle = await currentCycle(tx, req);
    const now = new Date();
    await applyTransition(tx, req, "CLOSE", a.user.id, settings, now, data.reason || null);
    if (cycle) await tx.update(coachingRequestCycle).set({ closedAt: now, closedBy: a.user.id }).where(eq(coachingRequestCycle.id, cycle.id));
    await tx.update(coachingRequest).set({ closedAt: now }).where(eq(coachingRequest.id, req.id));

    const learner = await getUser(tx, req.learnerId);
    const coach = await findUserRow(tx, req.coachId);
    const cycleNumber = cycle?.cycleNumber ?? req.currentCycleNumber;
    await notify(tx, {
      recipients: [learner, ...(coach ? [coach] : [])].filter((u) => u.id !== a.user.id),
      type: "REQUEST_CLOSED",
      title: `Demande ${req.reference} clôturée`,
      summary: `La demande a été clôturée par ${a.user.name}.`,
      requestId: req.id,
      eventKey: `CLOSED:${req.id}:${cycleNumber}`,
    });
    await notify(tx, {
      recipients: [learner],
      type: "RATING_AVAILABLE",
      title: "Évaluez votre accompagnement",
      summary: `Vous pouvez désormais évaluer l’accompagnement reçu pour la demande ${req.reference}.`,
      requestId: req.id,
      eventKey: `RATING_AVAILABLE:${req.id}:${cycleNumber}`,
    });
  });
}

// ---------------------------------------------------------------- réouverture, évaluation

export async function reopenRequest(call: LiveCall, requestId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ reason: zReason("Le motif de réouverture") }), input);
  await db.transaction(async (tx) => {
    const req = await lockRequest(tx, requestId);
    if (req.status !== "CLOSED") throw businessRule("Seule une demande clôturée peut être réouverte.");
    const now = new Date();
    const policy = await policyAt(tx, now);
    const due = addWorkingMinutes(now, policy.response_target_working_minutes, calendarOfPolicy(policy, await allHolidays(tx)));
    const cycleNumber = req.currentCycleNumber + 1;
    const cycleId = newId("cyc");
    await tx.insert(coachingRequestCycle).values({
      id: cycleId,
      requestId: req.id,
      cycleNumber,
      startedAt: now,
      assignedCoachId: req.coachId,
      dueAt: due,
      policyId: policy.id,
      reopenedBy: a.user.id,
      reopenReason: data.reason,
      createdAt: now,
    });
    // Le nouveau cycle devient courant AVANT l'historisation de la transition.
    await tx
      .update(coachingRequest)
      .set({ currentCycleNumber: cycleNumber, firstResponseAt: null, dueAt: due, closedAt: null, updatedAt: now })
      .where(eq(coachingRequest.id, req.id));
    Object.assign(req, { currentCycleNumber: cycleNumber, firstResponseAt: null, dueAt: due, closedAt: null });
    await applyTransition(tx, req, "REOPEN", a.user.id, await getAppSettings(tx), now, data.reason);
    await systemMessage(tx, req, cycleId, `Demande réouverte par l’administration (cycle ${cycleNumber}). Motif : ${data.reason}`, now);
    await audit(tx, {
      actor_id: a.user.id,
      action: "REQUEST_REOPENED",
      entity_type: "coaching_request",
      entity_id: req.id,
      reason: data.reason,
      metadata: { cycle_number: cycleNumber, due_at: due.toISOString() },
    });
    const coach = await findUserRow(tx, req.coachId);
    await notify(tx, {
      recipients: [await getUser(tx, req.learnerId), ...(coach ? [coach] : [])],
      type: "REQUEST_REOPENED",
      title: `Demande ${req.reference} réouverte`,
      summary: `La demande a été réouverte par l’administration (cycle ${cycleNumber}).`,
      requestId: req.id,
      eventKey: `REOPENED:${req.id}:${cycleNumber}`,
    });
  });
}

export async function rateRequest(call: LiveCall, requestId: string, input: unknown) {
  const a = await authenticate(call, "LEARNER");
  const data = parse(
    z.object({
      score: z.number().int("La note doit être un entier.").min(1, "Note entre 1 et 5.").max(5, "Note entre 1 et 5."),
      comment: z.string().trim().max(1000, "1000 caractères maximum.").optional().nullable(),
    }),
    input,
  );
  await db.transaction(async (tx) => {
    const req = await lockOwnRequest(tx, a, requestId);
    if (req.status !== "CLOSED") throw businessRule("Seule une demande clôturée peut être évaluée.");
    const cycle = await currentCycle(tx, req);
    if (!cycle || !cycle.closedAt) throw businessRule("Le cycle courant n’est pas clôturé.");
    const [existing] = await tx
      .select({ id: coachingRating.id })
      .from(coachingRating)
      .where(and(eq(coachingRating.requestId, req.id), eq(coachingRating.cycleId, cycle.id)));
    if (existing) throw conflict("Vous avez déjà évalué ce cycle de la demande.");
    const coachId = cycle.assignedCoachId ?? req.coachId;
    if (!coachId) throw businessRule("Aucun coach à évaluer.");
    await tx.insert(coachingRating).values({
      id: newId("rat"),
      requestId: req.id,
      cycleId: cycle.id,
      cycleNumber: cycle.cycleNumber,
      learnerId: a.user.id,
      coachId,
      score: data.score,
      comment: data.comment || null,
    });
    if ((await getAppSettings(tx)).coach_can_view_ratings) {
      const coach = await findUserRow(tx, coachId);
      await notify(tx, {
        recipients: coach ? [coach] : [],
        type: "RATING_RECEIVED",
        title: `Nouvelle évaluation (${req.reference})`,
        summary: "Un apprenant a évalué votre accompagnement.",
        requestId: req.id,
        eventKey: `RATED:${req.id}:${cycle.cycleNumber}`,
      });
    }
  });
}

// ---------------------------------------------------------------- notes internes

export async function addNote(call: LiveCall, requestId: string, input: unknown) {
  const a = await authenticate(call, "COACH");
  const data = parse(z.object({ body: zText(1, 5000, "La note") }), input);
  const req = await readRequest(db, requestId);
  if (!canWriteNotes(a.actor, toRequest(req))) throw forbidden("Vous n’êtes pas autorisé à annoter cette demande.");
  await db.insert(coachingNote).values({ id: newId("note"), requestId: req.id, authorId: a.user.id, body: data.body });
}

/** Lecture isolée des notes (même contrôle que le détail ; REC-16). */
export async function listNotes(call: LiveCall, requestId: string) {
  const a = await authenticate(call);
  const req = await readRequest(db, requestId);
  if (!canViewNotes(a.actor, toRequest(req))) throw forbidden("Les notes internes ne sont pas accessibles.");
  const notes = await db.select().from(coachingNote).where(eq(coachingNote.requestId, req.id)).orderBy(desc(coachingNote.createdAt));
  const names = await namesOf(db, notes.map((n) => n.authorId));
  return notes.map((n) => ({ id: n.id, body: n.body, created_at: n.createdAt.toISOString(), author: nameIn(names, n.authorId) }));
}

// ---------------------------------------------------------------- administration d'une demande

/**
 * Réaffectation d'une demande verrouillée (utilisée aussi lors d'un changement de coach principal).
 * Les échanges précédents sont conservés ; l'échéance du cycle n'est pas modifiée.
 */
export async function reassignRequestInTx(tx: Tx, req: ReqRow, newCoachId: string, actorId: string, reason: string, now: Date) {
  if (!isOpen(req.status)) throw businessRule("Seule une demande ouverte peut être réaffectée.");
  const coach = await getUser(tx, newCoachId);
  if (coach.role !== "COACH" || coach.status !== "ACTIVE") throw businessRule("Le nouveau coach doit être un coach actif.");
  if (req.coachId === coach.id) throw businessRule("Ce coach est déjà responsable de la demande.");
  const cycle = await currentCycle(tx, req);
  const old = await findUserRow(tx, req.coachId);
  await tx.insert(requestAssignmentHistory).values({
    id: newId("rah"),
    requestId: req.id,
    cycleId: cycle?.id ?? null,
    oldCoachId: req.coachId,
    newCoachId: coach.id,
    changedBy: actorId,
    reason,
    createdAt: now,
  });
  await tx.update(coachingRequest).set({ coachId: coach.id, updatedAt: now }).where(eq(coachingRequest.id, req.id));
  req.coachId = coach.id;
  req.updatedAt = now;
  if (cycle) {
    await tx.update(coachingRequestCycle).set({ assignedCoachId: coach.id }).where(eq(coachingRequestCycle.id, cycle.id));
    await systemMessage(tx, req, cycle.id, `La demande a été confiée à ${coach.name}. Les échanges précédents sont conservés.`, now);
  }
  await audit(tx, { actor_id: actorId, action: "REQUEST_REASSIGNED", entity_type: "coaching_request", entity_id: req.id, reason, metadata: { old_coach_id: old?.id ?? null, new_coach_id: coach.id } });
  const at = now.toISOString();
  await notify(tx, { recipients: [coach], type: "REQUEST_ASSIGNED", title: `Demande ${req.reference} qui vous est confiée`, summary: "Une demande de coaching vous a été réaffectée.", requestId: req.id, eventKey: `REASSIGNED:${req.id}:${at}` });
  if (old) await notify(tx, { recipients: [old], type: "REASSIGNMENT", title: `Demande ${req.reference} réaffectée`, summary: `Cette demande est désormais suivie par ${coach.name}.`, eventKey: `REASSIGNED_OLD:${req.id}:${at}` });
  await notify(tx, { recipients: [await getUser(tx, req.learnerId)], type: "REASSIGNMENT", title: `Nouveau coach pour ${req.reference}`, summary: `Votre demande est désormais suivie par ${coach.name}.`, requestId: req.id, eventKey: `REASSIGNED_LEARNER:${req.id}:${at}` });
}

export async function reassignRequest(call: LiveCall, requestId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ coachId: z.string().min(1, "Sélectionnez un coach."), reason: zReason() }), input);
  await db.transaction(async (tx) => {
    const req = await lockRequest(tx, requestId);
    await reassignRequestInTx(tx, req, data.coachId, a.user.id, data.reason, new Date());
  });
}

/** Recalcul explicite et audité de l'échéance (PRD §7.3). Jamais automatique. */
export async function recalculateDue(call: LiveCall, requestId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ reason: zReason() }), input);
  return db.transaction(async (tx) => {
    const req = await lockRequest(tx, requestId);
    const cycle = await currentCycle(tx, req);
    if (!isOpen(req.status) || !cycle) throw businessRule("Seule une demande ouverte peut voir son échéance recalculée.");
    if (cycle.firstResponseAt) throw businessRule("La première réponse a déjà été apportée : l’échéance n’a plus d’effet.");
    const now = new Date();
    const policy = await policyAt(tx, now);
    const due = addWorkingMinutes(cycle.startedAt, policy.response_target_working_minutes, calendarOfPolicy(policy, await allHolidays(tx)));
    const before = { due_at: cycle.dueAt.toISOString(), policy_id: cycle.policyId };
    await tx.update(coachingRequestCycle).set({ dueAt: due, policyId: policy.id }).where(eq(coachingRequestCycle.id, cycle.id));
    await tx.update(coachingRequest).set({ dueAt: due, updatedAt: now }).where(eq(coachingRequest.id, req.id));
    await audit(tx, {
      actor_id: a.user.id,
      action: "DUE_DATE_RECALCULATED",
      entity_type: "coaching_request",
      entity_id: req.id,
      reason: data.reason,
      metadata: { before, after: { due_at: due.toISOString(), policy_id: policy.id } },
    });
    return { due_at: due.toISOString() };
  });
}

export async function setPriority(call: LiveCall, requestId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN", "COACH");
  const data = parse(z.object({ priority: z.enum(PRIORITIES), reason: z.string().trim().max(300).optional().nullable() }), input);
  await db.transaction(async (tx) => {
    const req = await lockRequest(tx, requestId);
    if (a.actor.role === "COACH" && !canActAsCoach(a.actor, toRequest(req))) throw forbidden();
    if (!isOpen(req.status)) throw businessRule("La priorité ne peut être modifiée que sur une demande ouverte.");
    if (req.priority === data.priority) return;
    await tx.update(coachingRequest).set({ priority: data.priority, updatedAt: new Date() }).where(eq(coachingRequest.id, req.id));
    await audit(tx, {
      actor_id: a.user.id,
      action: "REQUEST_PRIORITY_CHANGED",
      entity_type: "coaching_request",
      entity_id: req.id,
      reason: data.reason || null,
      metadata: { from: req.priority, to: data.priority },
    });
  });
}

export async function nudgeCoach(call: LiveCall, requestId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ message: zText(3, 300, "Le message") }), input);
  await db.transaction(async (tx) => {
    const req = await readRequest(tx, requestId);
    const coach = await findUserRow(tx, req.coachId);
    if (!coach) throw businessRule("Aucun coach n’est responsable de cette demande.");
    await notify(tx, {
      recipients: [coach],
      type: "ESCALATION",
      title: `Relance de l’administration (${req.reference})`,
      summary: data.message,
      requestId: req.id,
      eventKey: `NUDGE:${req.id}:${new Date().toISOString()}`,
    });
    await audit(tx, { actor_id: a.user.id, action: "COACH_NUDGED", entity_type: "coaching_request", entity_id: req.id, reason: data.message });
  });
}

// ---------------------------------------------------------------- pièces jointes

/** Téléchargement après contrôle d'accès (REC-17), servi par GET /api/attachments/<id>. */
export async function readAttachment(call: LiveCall, attachmentId: string) {
  const a = await authenticate(call);
  const [att] = await db.select().from(messageAttachment).where(eq(messageAttachment.id, String(attachmentId)));
  if (!att) throw notFound("Pièce jointe introuvable.");
  assertCanViewRequest(a.actor, toRequest(await readRequest(db, att.requestId)));
  const data = await privateFiles.get(att.storageKey);
  if (!data) throw notFound("Le fichier n’est plus disponible.");
  return { data, mime: att.mimeType, filename: att.originalFilename };
}
