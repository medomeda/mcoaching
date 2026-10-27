/**
 * Demandes de coaching (PRD §6.2, §7, §8, §9.7–9.10, §15.3–15.5).
 * Chaque opération : session → rôle → politique d'accès → validation → transaction atomique.
 */
import { z } from "zod";
import { AppError, businessRule, conflict, forbidden, notFound, validation } from "@/modules/core/errors";
import {
  PRIORITIES,
  REQUEST_STATUSES,
  type CoachingMessage,
  type CoachingRequest,
  type Database,
  type MessageAttachment,
  type MessageIntent,
  type RequestCycle,
  type User,
} from "@/modules/core/types";
import { addWorkingMinutes } from "@/modules/deadlines/businessHours";
import { calendarOfPolicy } from "@/modules/deadlines/sla";
import { checkSubmissionEligibility, INELIGIBILITY_MESSAGES } from "@/modules/entitlements/entitlements";
import {
  assertCanViewRequest,
  canActAsCoach,
  canActAsLearner,
  canViewNotes,
  canWriteNotes,
  type Actor,
} from "@/modules/permissions/policies";
import { isOpen, planTransition, type RequestAction } from "@/modules/requests/stateMachine";
import { newId, randomToken } from "../crypto";
import {
  activeAssignment,
  audit,
  currentCycle,
  currentEntitlement,
  findUser,
  getRequest,
  getUser,
  paginate,
  policyAt,
  policyById,
  recordStatusChange,
  userName,
  nextRequestReference,
} from "../db/helpers";
import { validateUpload, type UploadInput, type ValidatedFile } from "../files/validation";
import { notify } from "../notify";
import { authenticate, files, parse, reauth, store, zReason, zText, type Authed, type Call } from "./context";
import { requestSla, requestSummary, type RequestSummary } from "./views";

// ---------------------------------------------------------------- utilitaires

function settingsOpts(db: Database) {
  return { learnerFollowUpReopensProcessing: db.app_settings.learner_follow_up_reopens_processing };
}

function applyTransition(db: Database, now: Date, req: CoachingRequest, action: RequestAction, actorId: string | null, reason: string | null = null) {
  for (const next of planTransition(req.status, action, settingsOpts(db))) {
    recordStatusChange(db, now, req, next, actorId, reason);
  }
}

function markRead(db: Database, requestId: string, userId: string, iso: string) {
  const r = db.request_reads.find((x) => x.request_id === requestId && x.user_id === userId);
  if (r) r.last_read_at = iso;
  else db.request_reads.push({ request_id: requestId, user_id: userId, last_read_at: iso });
}

function systemMessage(db: Database, now: Date, req: CoachingRequest, cycle: RequestCycle, body: string) {
  db.coaching_messages.push({
    id: newId("msg"),
    request_id: req.id,
    cycle_id: cycle.id,
    sender_id: null,
    kind: "SYSTEM",
    intent: "MESSAGE",
    body,
    created_at: now.toISOString(),
  });
}

/** Écrit les fichiers validés dans le stockage privé AVANT la transaction ; nettoyage si échec. */
async function withStoredFiles<T>(uploads: UploadInput[] | undefined, fn: (stored: Array<ValidatedFile & { key: string }>) => Promise<T>): Promise<T> {
  const db = store().snapshot();
  const list = uploads ?? [];
  if (list.length > db.app_settings.attachment_max_files_per_message) {
    throw validation(`Vous pouvez joindre au maximum ${db.app_settings.attachment_max_files_per_message} fichiers.`);
  }
  const validated = list.map((f) => validateUpload(f, db.app_settings));
  const stored: Array<ValidatedFile & { key: string }> = [];
  try {
    for (const v of validated) {
      const key = `att_${randomToken(16)}`;
      await files().put(key, { data: v.data, mime: v.mime });
      stored.push({ ...v, key });
    }
    return await fn(stored);
  } catch (e) {
    for (const s of stored) await files().delete(s.key).catch(() => undefined);
    throw e;
  }
}

function attachFiles(db: Database, now: Date, req: CoachingRequest, messageId: string | null, uploaderId: string, stored: Array<ValidatedFile & { key: string }>) {
  for (const s of stored) {
    const att: MessageAttachment = {
      id: newId("att"),
      message_id: messageId,
      request_id: req.id,
      uploaded_by: uploaderId,
      original_filename: s.originalName,
      storage_key: s.key,
      mime_type: s.mime,
      size_bytes: s.size,
      created_at: now.toISOString(),
    };
    db.message_attachments.push(att);
  }
}

function attachmentView(a: MessageAttachment) {
  return { id: a.id, filename: a.original_filename, mime_type: a.mime_type, size_bytes: a.size_bytes, created_at: a.created_at, uploaded_by: a.uploaded_by };
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

export function allowedActions(db: Database, actor: Actor, req: CoachingRequest): UiAction[] {
  const out: UiAction[] = [];
  const opts = settingsOpts(db);
  const s = req.status;
  if (canActAsLearner(actor, req)) {
    if (s === "DRAFT") out.push("EDIT_DRAFT", "SUBMIT", "ABANDON");
    if (s === "SUBMITTED") out.push("CANCEL");
    if (isOpen(s) && can(() => planTransition(s, "LEARNER_MESSAGE", opts))) out.push("MESSAGE");
    if (s === "RESPONSE_PROVIDED" && db.app_settings.learner_can_close) out.push("CLOSE");
    if (s === "CLOSED") {
      const cycle = currentCycle(db, req);
      if (cycle && !db.coaching_ratings.some((r) => r.request_id === req.id && r.cycle_id === cycle.id)) out.push("RATE");
    }
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
    const cycle = currentCycle(db, req);
    if (isOpen(s) && cycle && !cycle.first_response_at) out.push("RECALCULATE_DUE");
    const net = -db.coaching_quota_ledger.filter((e) => e.request_id === req.id && e.entry_type !== "CORRECTION").reduce((x, e) => x + e.quantity, 0);
    if (net > 0) out.push("REFUND");
  }
  return out;
}

// ---------------------------------------------------------------- éligibilité (apprenant)

export async function myEligibility(call: Call) {
  const a = await authenticate(call, "LEARNER");
  const db = store().snapshot();
  const now = store().now(db);
  const assignment = activeAssignment(db, a.user.id);
  const coach = findUser(db, assignment?.coach_id);
  const elig = checkSubmissionEligibility({
    learner: a.user,
    entitlement: currentEntitlement(db, a.user.id),
    ledger: db.coaching_quota_ledger,
    assignment,
    coach,
    now,
  });
  return {
    ...elig,
    messages: elig.reasons.map((r) => INELIGIBILITY_MESSAGES[r]),
    coach: coach ? { id: coach.id, full_name: coach.full_name } : null,
    entitlement: currentEntitlement(db, a.user.id) ?? null,
    attachment_settings: {
      max_files: db.app_settings.attachment_max_files_per_message,
      max_size_bytes: db.app_settings.attachment_max_size_bytes,
      allowed_extensions: db.app_settings.attachment_allowed_extensions,
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
export type RequestListFilters = z.input<typeof zList>;

const PRIORITY_RANK = { URGENT: 3, HIGH: 2, NORMAL: 1 } as const;

function awaitingReply(db: Database, req: CoachingRequest): boolean {
  if (!["SUBMITTED", "WAITING_FOR_COACH", "IN_PROGRESS"].includes(req.status)) return false;
  const last = db.coaching_messages
    .filter((m) => m.request_id === req.id && m.kind === "USER")
    .sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
  return !last || last.sender_id === req.learner_id;
}

/** Interventions administrateur : retard, coach suspendu/absent, aucun coach. */
export function needsAttention(db: Database, req: CoachingRequest, s: RequestSummary, now: Date): string[] {
  const reasons: string[] = [];
  if (!isOpen(req.status)) return reasons;
  if (s.sla?.is_overdue) reasons.push("En retard");
  if (!req.coach_id) reasons.push("Aucun coach");
  const coach = findUser(db, req.coach_id);
  if (coach && coach.status !== "ACTIVE") reasons.push("Coach suspendu");
  const t = now.getTime();
  if (coach && db.coach_absences.some((x) => x.coach_id === coach.id && !x.cancelled_at && new Date(x.starts_at).getTime() <= t && new Date(x.ends_at).getTime() > t)) {
    if (["SUBMITTED", "WAITING_FOR_COACH", "IN_PROGRESS"].includes(req.status)) reasons.push("Coach absent");
  }
  return reasons;
}

export async function listRequests(call: Call, input: unknown) {
  const a = await authenticate(call);
  const f = parse(zList, input ?? {});
  const db = store().snapshot();
  const now = store().now(db);
  const q = f.q?.toLowerCase();

  let base = db.coaching_requests.filter((r) => {
    if (a.actor.role === "LEARNER") return r.learner_id === a.user.id;
    if (a.actor.role === "COACH") return r.coach_id === a.user.id && r.status !== "DRAFT";
    return r.status !== "DRAFT"; // les brouillons restent privés à l'apprenant
  });
  if (a.actor.role === "ADMIN" && f.coachId) base = base.filter((r) => r.coach_id === f.coachId);
  // Filtre appliqué APRÈS le cloisonnement par rôle : il ne peut qu'en réduire le périmètre.
  if (f.learnerId) base = base.filter((r) => r.learner_id === f.learnerId);
  const rows = base
    .filter((r) => !q || (r.reference ?? "").toLowerCase().includes(q) || r.subject.toLowerCase().includes(q))
    .filter((r) => !f.statuses?.length || f.statuses.includes(r.status))
    .filter((r) => !f.categoryId || r.category_id === f.categoryId)
    .filter((r) => !f.priority || r.priority === f.priority)
    .filter((r) => !f.from || (r.submitted_at ?? r.created_at) >= f.from)
    .filter((r) => !f.to || (r.submitted_at ?? r.created_at) <= f.to)
    .map((r) => ({ req: r, s: requestSummary(db, r, now, a.actor) }))
    .filter(({ req, s }) => {
      switch (f.view) {
        case "todo":
          return ["SUBMITTED", "WAITING_FOR_COACH", "IN_PROGRESS"].includes(req.status);
        case "awaiting_reply":
          return awaitingReply(db, req);
        case "in_progress":
          return req.status === "IN_PROGRESS";
        case "waiting_learner":
          return req.status === "WAITING_FOR_LEARNER";
        case "overdue":
          return !!s.sla?.is_overdue;
        case "due_soon":
          return !!s.sla?.due_soon;
        case "closed":
          return req.status === "CLOSED";
        case "open":
          return isOpen(req.status);
        case "drafts":
          return req.status === "DRAFT";
        case "needs_attention":
          return needsAttention(db, req, s, now).length > 0;
        default:
          return true;
      }
    });

  const sorters: Record<typeof f.sort, (x: (typeof rows)[number], y: (typeof rows)[number]) => number> = {
    submitted_desc: (x, y) => (y.req.submitted_at ?? y.req.created_at).localeCompare(x.req.submitted_at ?? x.req.created_at),
    submitted_asc: (x, y) => (x.req.submitted_at ?? x.req.created_at).localeCompare(y.req.submitted_at ?? y.req.created_at),
    due_asc: (x, y) => (x.req.due_at ?? "9999").localeCompare(y.req.due_at ?? "9999"),
    updated_desc: (x, y) => y.req.updated_at.localeCompare(x.req.updated_at),
    priority_desc: (x, y) => PRIORITY_RANK[y.req.priority] - PRIORITY_RANK[x.req.priority] || (x.req.due_at ?? "9999").localeCompare(y.req.due_at ?? "9999"),
  };
  rows.sort(sorters[f.sort]);
  const page = paginate(rows, f.page, f.pageSize);
  return {
    ...page,
    items: page.items.map(({ req, s }) => ({ ...s, attention: a.actor.role === "ADMIN" ? needsAttention(db, req, s, now) : [] })),
  };
}

// ---------------------------------------------------------------- détail

export async function getRequestDetail(call: Call, requestId: string) {
  const a = await authenticate(call);
  const db0 = store().snapshot();
  const req0 = getRequest(db0, requestId);
  assertCanViewRequest(a.actor, req0);

  // Écritures liées à la consultation : accusé de lecture, « enregistrement initial » par le coach
  // responsable, journalisation de la consultation administrative (1×/jour/admin/demande).
  await store().transaction((db, now) => {
    const req = getRequest(db, requestId);
    const iso = now.toISOString();
    const read = db.request_reads.find((x) => x.request_id === req.id && x.user_id === a.user.id);
    const hasNew = db.coaching_messages.some((m) => m.request_id === req.id && (!read || m.created_at > read.last_read_at));
    if (!read || hasNew) markRead(db, req.id, a.user.id, iso);
    if (req.status === "SUBMITTED" && canActAsCoach(a.actor, req)) {
      applyTransition(db, now, req, "ACKNOWLEDGE", a.user.id, "Première consultation par le coach responsable");
    }
    if (a.actor.role === "ADMIN") {
      const day = iso.slice(0, 10);
      const already = db.audit_logs.some((l) => l.action === "REQUEST_VIEWED_BY_ADMIN" && l.actor_id === a.user.id && l.entity_id === req.id && l.created_at.startsWith(day));
      if (!already) audit(db, now, { actor_id: a.user.id, action: "REQUEST_VIEWED_BY_ADMIN", entity_type: "coaching_request", entity_id: req.id, reason: "Supervision" });
    }
  });

  const db = store().snapshot();
  const now = store().now(db);
  const req = getRequest(db, requestId);
  const summary = requestSummary(db, req, now, a.actor);
  const category = db.coaching_categories.find((c) => c.id === req.category_id);
  const cycles = db.coaching_request_cycles.filter((c) => c.request_id === req.id).sort((x, y) => x.cycle_number - y.cycle_number);
  const atts = db.message_attachments.filter((x) => x.request_id === req.id);
  const showNotes = canViewNotes(a.actor, req);
  const ratingsVisible = a.actor.role === "ADMIN" || a.actor.role === "LEARNER" || db.app_settings.coach_can_view_ratings;
  const sla = requestSla(db, req, now);

  return {
    ...summary,
    description: req.description,
    category_id: req.category_id,
    category_name: category?.name ?? "—",
    sla_detail: sla,
    attachments: atts.filter((x) => x.message_id === null).map(attachmentView),
    messages: db.coaching_messages
      .filter((m) => m.request_id === req.id)
      .sort((x, y) => x.created_at.localeCompare(y.created_at))
      .map((m) => {
        const sender = findUser(db, m.sender_id);
        return {
          id: m.id,
          kind: m.kind,
          intent: m.intent,
          body: m.body,
          created_at: m.created_at,
          cycle_number: cycles.find((c) => c.id === m.cycle_id)?.cycle_number ?? 1,
          sender: sender ? { id: sender.id, full_name: sender.full_name, role: sender.role } : null,
          attachments: atts.filter((x) => x.message_id === m.id).map(attachmentView),
        };
      }),
    notes: showNotes
      ? db.coaching_notes
          .filter((n) => n.request_id === req.id)
          .sort((x, y) => y.created_at.localeCompare(x.created_at))
          .map((n) => ({ id: n.id, body: n.body, created_at: n.created_at, author: userName(db, n.author_id) }))
      : null,
    status_history: db.request_status_history
      .filter((h) => h.request_id === req.id)
      .sort((x, y) => x.created_at.localeCompare(y.created_at))
      .map((h) => ({ ...h, changed_by_name: userName(db, h.changed_by), cycle_number: cycles.find((c) => c.id === h.cycle_id)?.cycle_number ?? null })),
    assignment_history: db.request_assignment_history
      .filter((h) => h.request_id === req.id)
      .sort((x, y) => x.created_at.localeCompare(y.created_at))
      .map((h) => ({ ...h, old_coach_name: h.old_coach_id ? userName(db, h.old_coach_id) : null, new_coach_name: userName(db, h.new_coach_id), changed_by_name: userName(db, h.changed_by) })),
    cycles: cycles.map((c) => {
      const pol = policyById(db, c.policy_id);
      const rating = db.coaching_ratings.find((r) => r.cycle_id === c.id);
      return {
        cycle_number: c.cycle_number,
        started_at: c.started_at,
        closed_at: c.closed_at,
        closed_by_name: c.closed_by ? userName(db, c.closed_by) : null,
        due_at: c.due_at,
        first_response_at: c.first_response_at,
        assigned_coach_name: c.assigned_coach_id ? userName(db, c.assigned_coach_id) : null,
        reopened_by_name: c.reopened_by ? userName(db, c.reopened_by) : null,
        reopen_reason: c.reopen_reason,
        policy_target_hours: pol.response_target_working_minutes / 60,
        rating: rating && ratingsVisible ? { score: rating.score, comment: rating.comment, created_at: rating.created_at } : null,
      };
    }),
    allowed_actions: allowedActions(db, a.actor, req),
    settings: { learner_can_close: db.app_settings.learner_can_close, max_files: db.app_settings.attachment_max_files_per_message, max_size_bytes: db.app_settings.attachment_max_size_bytes, allowed_extensions: db.app_settings.attachment_allowed_extensions },
  };
}
export type RequestDetail = Awaited<ReturnType<typeof getRequestDetail>>;

// ---------------------------------------------------------------- brouillons & soumission (apprenant)

const zDraft = z.object({
  category_id: z.string().min(1, "Sélectionnez une catégorie."),
  subject: zText(5, 150, "Le sujet"),
  description: zText(20, 5000, "La description"),
});

function getOwnRequest(db: Database, a: Authed, id: string) {
  const req = getRequest(db, id);
  if (!canActAsLearner(a.actor, req)) throw forbidden("Vous n’avez pas accès à cette demande.");
  return req;
}

function assertCategory(db: Database, id: string) {
  const c = db.coaching_categories.find((x) => x.id === id);
  if (!c || !c.is_active) throw validation("Catégorie invalide.", { category_id: "Catégorie invalide ou désactivée." });
}

export async function createDraft(call: Call, input: unknown, uploads?: UploadInput[]) {
  const a = await authenticate(call, "LEARNER");
  const data = parse(zDraft, input);
  return withStoredFiles(uploads, (stored) =>
    store().transaction((db, now) => {
      reauth(db, a);
      assertCategory(db, data.category_id);
      const iso = now.toISOString();
      const req: CoachingRequest = {
        id: newId("req"),
        reference: null,
        learner_id: a.user.id,
        coach_id: null,
        category_id: data.category_id,
        subject: data.subject,
        description: data.description,
        priority: "NORMAL",
        status: "DRAFT",
        submitted_at: null,
        first_response_at: null,
        due_at: null,
        closed_at: null,
        current_cycle_number: 0,
        submit_idempotency_key: null,
        created_at: iso,
        updated_at: iso,
      };
      db.coaching_requests.push(req);
      db.request_status_history.push({ id: newId("rsh"), request_id: req.id, cycle_id: null, old_status: null, new_status: "DRAFT", changed_by: a.user.id, reason: null, created_at: iso });
      attachFiles(db, now, req, null, a.user.id, stored);
      return { id: req.id };
    }),
  );
}

export async function updateDraft(call: Call, requestId: string, input: unknown, uploads?: UploadInput[]) {
  const a = await authenticate(call, "LEARNER");
  const data = parse(zDraft.extend({ removeAttachmentIds: z.array(z.string()).default([]) }), input);
  const removedKeys: string[] = [];
  const res = await withStoredFiles(uploads, (stored) =>
    store().transaction((db, now) => {
      reauth(db, a);
      const req = getOwnRequest(db, a, requestId);
      if (req.status !== "DRAFT") throw businessRule("Seul un brouillon peut être modifié.");
      assertCategory(db, data.category_id);
      req.category_id = data.category_id;
      req.subject = data.subject;
      req.description = data.description;
      req.updated_at = now.toISOString();
      // Retrait de pièces jointes d'un brouillon non soumis (jamais partagées).
      db.message_attachments = db.message_attachments.filter((x) => {
        const remove = x.request_id === req.id && x.message_id === null && data.removeAttachmentIds.includes(x.id);
        if (remove) removedKeys.push(x.storage_key);
        return !remove;
      });
      attachFiles(db, now, req, null, a.user.id, stored);
      const count = db.message_attachments.filter((x) => x.request_id === req.id && x.message_id === null).length;
      if (count > db.app_settings.attachment_max_files_per_message) {
        throw validation(`Au maximum ${db.app_settings.attachment_max_files_per_message} fichiers par demande.`);
      }
      return { id: req.id };
    }),
  );
  for (const k of removedKeys) await files().delete(k).catch(() => undefined);
  return res;
}

export async function abandonDraft(call: Call, requestId: string) {
  const a = await authenticate(call, "LEARNER");
  await store().transaction((db, now) => {
    reauth(db, a);
    const req = getOwnRequest(db, a, requestId);
    applyTransition(db, now, req, "ABANDON", a.user.id, "Brouillon abandonné");
  });
}

/**
 * Soumission atomique (PRD §6.2 étapes 8–14, REC-01/02/03/20) :
 * contrôles relus dans le verrou, consommation unique (clé d'idempotence), échéance figée.
 */
export async function submitRequest(call: Call, requestId: string, input: unknown) {
  const a = await authenticate(call, "LEARNER");
  const data = parse(z.object({ idempotencyKey: z.string().min(8).max(100) }), input);
  return store().transaction((db, now) => {
    const learner = reauth(db, a);
    const req = getOwnRequest(db, a, requestId);
    if (req.status !== "DRAFT") {
      // Répétition de la même opération : on renvoie le résultat sans rien consommer.
      if (req.submit_idempotency_key === data.idempotencyKey) return { id: req.id, reference: req.reference, due_at: req.due_at, replayed: true };
      throw conflict("Cette demande a déjà été soumise.");
    }
    assertCategory(db, req.category_id);
    const assignment = activeAssignment(db, learner.id);
    const coach = findUser(db, assignment?.coach_id);
    const ent = currentEntitlement(db, learner.id);
    const elig = checkSubmissionEligibility({ learner, entitlement: ent, ledger: db.coaching_quota_ledger, assignment, coach, now });
    if (!elig.ok) throw businessRule(elig.reasons.map((r) => INELIGIBILITY_MESSAGES[r]).join(" "));

    const iso = now.toISOString();
    const policy = policyAt(db, now);
    const due = addWorkingMinutes(now, policy.response_target_working_minutes, calendarOfPolicy(policy, db.service_holidays));

    req.reference = nextRequestReference(db, now);
    req.coach_id = coach!.id;
    req.submitted_at = iso;
    req.due_at = due.toISOString();
    req.current_cycle_number = 1;
    req.submit_idempotency_key = data.idempotencyKey;
    const cycle: RequestCycle = {
      id: newId("cyc"),
      request_id: req.id,
      cycle_number: 1,
      started_at: iso,
      closed_at: null,
      closed_by: null,
      assigned_coach_id: coach!.id,
      first_response_at: null,
      first_response_by: null,
      due_at: due.toISOString(),
      policy_id: policy.id,
      reopened_by: null,
      reopen_reason: null,
      created_at: iso,
    };
    db.coaching_request_cycles.push(cycle);
    applyTransition(db, now, req, "SUBMIT", learner.id);

    if (ent && ent.quota_enabled) {
      const key = `submit:${req.id}`;
      if (db.coaching_quota_ledger.some((e) => e.idempotency_key === key)) throw conflict("Quota déjà consommé pour cette demande.");
      db.coaching_quota_ledger.push({
        id: newId("qle"),
        learner_id: learner.id,
        entitlement_id: ent.id,
        request_id: req.id,
        entry_type: "CONSUME",
        quantity: -1,
        reason: null,
        created_by: learner.id,
        created_at: iso,
        idempotency_key: key,
      });
    }
    // Accusé de réception automatique : message SYSTÈME, jamais compté comme première réponse (REC-05).
    systemMessage(db, now, req, cycle, `Demande ${req.reference} bien reçue. Votre coach dispose d’un délai cible de ${policy.response_target_working_minutes / 60} heures ouvrées pour vous apporter une première réponse.`);
    markRead(db, req.id, learner.id, iso);

    notify(db, now, {
      recipients: [coach!],
      type: "REQUEST_SUBMITTED",
      title: `Nouvelle demande ${req.reference}`,
      summary: `${learner.full_name} a soumis une nouvelle demande de coaching.`,
      requestId: req.id,
      eventKey: `SUBMITTED:${req.id}`,
    });
    notify(db, now, {
      recipients: [learner],
      type: "REQUEST_SUBMITTED",
      title: `Demande ${req.reference} enregistrée`,
      summary: `Votre demande a bien été transmise à ${coach!.full_name}.`,
      requestId: req.id,
      eventKey: `SUBMITTED_CONFIRM:${req.id}`,
    });
    return { id: req.id, reference: req.reference, due_at: req.due_at, replayed: false };
  });
}

export async function cancelRequest(call: Call, requestId: string, input: unknown) {
  const a = await authenticate(call, "LEARNER");
  const data = parse(z.object({ reason: zReason() }), input);
  await store().transaction((db, now) => {
    reauth(db, a);
    const req = getOwnRequest(db, a, requestId);
    applyTransition(db, now, req, "CANCEL", a.user.id, data.reason);
    const coach = findUser(db, req.coach_id);
    notify(db, now, {
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

export async function sendMessage(call: Call, requestId: string, input: unknown, uploads?: UploadInput[]) {
  const a = await authenticate(call, "LEARNER", "COACH");
  const data = parse(zMessage, input);
  return withStoredFiles(uploads, (stored) =>
    store().transaction((db, now) => {
      const sender = reauth(db, a);
      const req = getRequest(db, requestId);
      assertCanViewRequest(a.actor, req);
      const isCoach = a.actor.role === "COACH";
      if (isCoach && !canActAsCoach(a.actor, req)) throw forbidden("Vous n’êtes plus le coach responsable de cette demande.");
      if (!isCoach && !canActAsLearner(a.actor, req)) throw forbidden();
      if (!isOpen(req.status)) throw businessRule("Cette demande n’est pas ouverte : aucun message ne peut être ajouté.");
      if (!isCoach && data.intent !== "MESSAGE") throw forbidden();

      const action: RequestAction = !isCoach
        ? "LEARNER_MESSAGE"
        : data.intent === "CLARIFICATION_REQUEST"
          ? "REQUEST_CLARIFICATION"
          : data.intent === "FINAL_RESPONSE"
            ? "FINAL_RESPONSE"
            : "COACH_MESSAGE";
      const cycle = currentCycle(db, req);
      if (!cycle) throw new AppError("INTERNAL", "Cycle de traitement introuvable.");
      const iso = now.toISOString();
      applyTransition(db, now, req, action, sender.id);

      const msg: CoachingMessage = {
        id: newId("msg"),
        request_id: req.id,
        cycle_id: cycle.id,
        sender_id: sender.id,
        kind: "USER",
        intent: data.intent as MessageIntent,
        body: data.body,
        created_at: iso,
      };
      db.coaching_messages.push(msg);
      attachFiles(db, now, req, msg.id, sender.id, stored);
      markRead(db, req.id, sender.id, iso);

      // Première réponse humaine du coach (réponse, précision ou réponse finale).
      if (isCoach && !cycle.first_response_at) {
        cycle.first_response_at = iso;
        cycle.first_response_by = sender.id;
        req.first_response_at = iso;
      }
      req.updated_at = iso;

      const recipient = isCoach ? getUser(db, req.learner_id) : findUser(db, req.coach_id);
      const kind = !isCoach ? "NEW_MESSAGE" : data.intent === "CLARIFICATION_REQUEST" ? "CLARIFICATION_REQUESTED" : data.intent === "FINAL_RESPONSE" ? "COACH_RESPONSE" : "COACH_RESPONSE";
      const titles = {
        NEW_MESSAGE: `Nouveau message sur ${req.reference}`,
        CLARIFICATION_REQUESTED: `Votre coach demande des précisions (${req.reference})`,
        COACH_RESPONSE: data.intent === "FINAL_RESPONSE" ? `Réponse apportée à votre demande ${req.reference}` : `Nouvelle réponse de votre coach (${req.reference})`,
      } as const;
      notify(db, now, {
        recipients: recipient ? [recipient] : [],
        type: kind,
        title: titles[kind],
        summary: `${sender.full_name} a ajouté un message${stored.length ? ` avec ${stored.length} pièce(s) jointe(s)` : ""}.`,
        requestId: req.id,
        eventKey: `MSG:${msg.id}`,
      });
      return { id: msg.id, status: req.status };
    }),
  );
}

export async function takeCharge(call: Call, requestId: string) {
  const a = await authenticate(call, "COACH");
  await store().transaction((db, now) => {
    reauth(db, a);
    const req = getRequest(db, requestId);
    if (!canActAsCoach(a.actor, req)) throw forbidden("Vous n’êtes pas le coach responsable de cette demande.");
    applyTransition(db, now, req, "TAKE_CHARGE", a.user.id);
  });
}

// ---------------------------------------------------------------- clôture, réouverture, évaluation

export async function closeRequest(call: Call, requestId: string, input: unknown) {
  const a = await authenticate(call);
  const data = parse(z.object({ reason: z.string().trim().max(500).optional().nullable() }), input ?? {});
  await store().transaction((db, now) => {
    const actor = reauth(db, a);
    const req = getRequest(db, requestId);
    assertCanViewRequest(a.actor, req);
    const allowed =
      a.actor.role === "ADMIN" ||
      canActAsCoach(a.actor, req) ||
      (canActAsLearner(a.actor, req) && db.app_settings.learner_can_close);
    if (!allowed) throw forbidden("Vous n’êtes pas autorisé à clôturer cette demande.");
    const cycle = currentCycle(db, req)!;
    applyTransition(db, now, req, "CLOSE", actor.id, data.reason || null);
    const iso = now.toISOString();
    cycle.closed_at = iso;
    cycle.closed_by = actor.id;
    req.closed_at = iso;
    const learner = getUser(db, req.learner_id);
    const coach = findUser(db, req.coach_id);
    const recipients: User[] = [learner, ...(coach ? [coach] : [])].filter((u) => u.id !== actor.id);
    notify(db, now, {
      recipients,
      type: "REQUEST_CLOSED",
      title: `Demande ${req.reference} clôturée`,
      summary: `La demande a été clôturée par ${actor.full_name}.`,
      requestId: req.id,
      eventKey: `CLOSED:${req.id}:${cycle.cycle_number}`,
    });
    notify(db, now, {
      recipients: [learner],
      type: "RATING_AVAILABLE",
      title: "Évaluez votre accompagnement",
      summary: `Vous pouvez désormais évaluer l’accompagnement reçu pour la demande ${req.reference}.`,
      requestId: req.id,
      eventKey: `RATING_AVAILABLE:${req.id}:${cycle.cycle_number}`,
    });
  });
}

export async function reopenRequest(call: Call, requestId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ reason: zReason("Le motif de réouverture") }), input);
  await store().transaction((db, now) => {
    reauth(db, a);
    const req = getRequest(db, requestId);
    if (req.status !== "CLOSED") throw businessRule("Seule une demande clôturée peut être réouverte.");
    const policy = policyAt(db, now);
    const iso = now.toISOString();
    const due = addWorkingMinutes(now, policy.response_target_working_minutes, calendarOfPolicy(policy, db.service_holidays));
    const cycle: RequestCycle = {
      id: newId("cyc"),
      request_id: req.id,
      cycle_number: req.current_cycle_number + 1,
      started_at: iso,
      closed_at: null,
      closed_by: null,
      assigned_coach_id: req.coach_id,
      first_response_at: null,
      first_response_by: null,
      due_at: due.toISOString(),
      policy_id: policy.id,
      reopened_by: a.user.id,
      reopen_reason: data.reason,
      created_at: iso,
    };
    db.coaching_request_cycles.push(cycle);
    // Le nouveau cycle devient courant AVANT l'historisation de la transition.
    req.current_cycle_number = cycle.cycle_number;
    req.first_response_at = null;
    req.due_at = cycle.due_at;
    req.closed_at = null;
    applyTransition(db, now, req, "REOPEN", a.user.id, data.reason);
    systemMessage(db, now, req, cycle, `Demande réouverte par l’administration (cycle ${cycle.cycle_number}). Motif : ${data.reason}`);
    audit(db, now, { actor_id: a.user.id, action: "REQUEST_REOPENED", entity_type: "coaching_request", entity_id: req.id, reason: data.reason, metadata: { cycle_number: cycle.cycle_number, due_at: cycle.due_at } });
    const recipients = [getUser(db, req.learner_id), ...(findUser(db, req.coach_id) ? [findUser(db, req.coach_id)!] : [])];
    notify(db, now, {
      recipients,
      type: "REQUEST_REOPENED",
      title: `Demande ${req.reference} réouverte`,
      summary: `La demande a été réouverte par l’administration (cycle ${cycle.cycle_number}).`,
      requestId: req.id,
      eventKey: `REOPENED:${req.id}:${cycle.cycle_number}`,
    });
  });
}

export async function rateRequest(call: Call, requestId: string, input: unknown) {
  const a = await authenticate(call, "LEARNER");
  const data = parse(
    z.object({
      score: z.number().int("La note doit être un entier.").min(1, "Note entre 1 et 5.").max(5, "Note entre 1 et 5."),
      comment: z.string().trim().max(1000, "1000 caractères maximum.").optional().nullable(),
    }),
    input,
  );
  await store().transaction((db, now) => {
    reauth(db, a);
    const req = getOwnRequest(db, a, requestId);
    if (req.status !== "CLOSED") throw businessRule("Seule une demande clôturée peut être évaluée.");
    const cycle = currentCycle(db, req);
    if (!cycle || !cycle.closed_at) throw businessRule("Le cycle courant n’est pas clôturé.");
    if (db.coaching_ratings.some((r) => r.request_id === req.id && r.cycle_id === cycle.id)) {
      throw conflict("Vous avez déjà évalué ce cycle de la demande.");
    }
    const coachId = cycle.assigned_coach_id ?? req.coach_id;
    if (!coachId) throw businessRule("Aucun coach à évaluer.");
    const iso = now.toISOString();
    db.coaching_ratings.push({
      id: newId("rat"),
      request_id: req.id,
      cycle_id: cycle.id,
      cycle_number: cycle.cycle_number,
      learner_id: a.user.id,
      coach_id: coachId,
      score: data.score,
      comment: data.comment || null,
      created_at: iso,
      updated_at: iso,
    });
    if (db.app_settings.coach_can_view_ratings) {
      const coach = findUser(db, coachId);
      notify(db, now, {
        recipients: coach ? [coach] : [],
        type: "RATING_RECEIVED",
        title: `Nouvelle évaluation (${req.reference})`,
        summary: "Un apprenant a évalué votre accompagnement.",
        requestId: req.id,
        eventKey: `RATED:${req.id}:${cycle.cycle_number}`,
      });
    }
  });
}

// ---------------------------------------------------------------- notes internes

export async function addNote(call: Call, requestId: string, input: unknown) {
  const a = await authenticate(call, "COACH");
  const data = parse(z.object({ body: zText(1, 5000, "La note") }), input);
  await store().transaction((db, now) => {
    reauth(db, a);
    const req = getRequest(db, requestId);
    if (!canWriteNotes(a.actor, req)) throw forbidden("Vous n’êtes pas autorisé à annoter cette demande.");
    const iso = now.toISOString();
    db.coaching_notes.push({ id: newId("note"), request_id: req.id, author_id: a.user.id, body: data.body, created_at: iso, updated_at: iso });
  });
}

/** Lecture isolée des notes (même contrôle que le détail ; REC-16). */
export async function listNotes(call: Call, requestId: string) {
  const a = await authenticate(call);
  const db = store().snapshot();
  const req = getRequest(db, requestId);
  if (!canViewNotes(a.actor, req)) throw forbidden("Les notes internes ne sont pas accessibles.");
  return db.coaching_notes.filter((n) => n.request_id === req.id).map((n) => ({ id: n.id, body: n.body, created_at: n.created_at, author: userName(db, n.author_id) }));
}

// ---------------------------------------------------------------- administration d'une demande

/** Réaffectation (utilisée aussi lors d'un changement de coach principal). */
export function reassignRequestInTx(db: Database, now: Date, req: CoachingRequest, newCoachId: string, actorId: string, reason: string) {
  if (!isOpen(req.status)) throw businessRule("Seule une demande ouverte peut être réaffectée.");
  const coach = getUser(db, newCoachId);
  if (coach.role !== "COACH" || coach.status !== "ACTIVE") throw businessRule("Le nouveau coach doit être un coach actif.");
  if (req.coach_id === coach.id) throw businessRule("Ce coach est déjà responsable de la demande.");
  const cycle = currentCycle(db, req);
  const old = findUser(db, req.coach_id);
  const iso = now.toISOString();
  db.request_assignment_history.push({
    id: newId("rah"),
    request_id: req.id,
    cycle_id: cycle?.id ?? null,
    old_coach_id: req.coach_id,
    new_coach_id: coach.id,
    changed_by: actorId,
    reason,
    created_at: iso,
  });
  req.coach_id = coach.id;
  req.updated_at = iso;
  if (cycle) cycle.assigned_coach_id = coach.id;
  if (cycle) systemMessage(db, now, req, cycle, `La demande a été confiée à ${coach.full_name}. Les échanges précédents sont conservés.`);
  audit(db, now, { actor_id: actorId, action: "REQUEST_REASSIGNED", entity_type: "coaching_request", entity_id: req.id, reason, metadata: { old_coach_id: old?.id ?? null, new_coach_id: coach.id } });
  notify(db, now, { recipients: [coach], type: "REQUEST_ASSIGNED", title: `Demande ${req.reference} qui vous est confiée`, summary: "Une demande de coaching vous a été réaffectée.", requestId: req.id, eventKey: `REASSIGNED:${req.id}:${iso}` });
  if (old) notify(db, now, { recipients: [old], type: "REASSIGNMENT", title: `Demande ${req.reference} réaffectée`, summary: `Cette demande est désormais suivie par ${coach.full_name}.`, eventKey: `REASSIGNED_OLD:${req.id}:${iso}` });
  notify(db, now, { recipients: [getUser(db, req.learner_id)], type: "REASSIGNMENT", title: `Nouveau coach pour ${req.reference}`, summary: `Votre demande est désormais suivie par ${coach.full_name}.`, requestId: req.id, eventKey: `REASSIGNED_LEARNER:${req.id}:${iso}` });
}

export async function reassignRequest(call: Call, requestId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ coachId: z.string().min(1, "Sélectionnez un coach."), reason: zReason() }), input);
  await store().transaction((db, now) => {
    reauth(db, a);
    reassignRequestInTx(db, now, getRequest(db, requestId), data.coachId, a.user.id, data.reason);
  });
}

/** Recalcul explicite et audité de l'échéance (PRD §7.3). Jamais automatique. */
export async function recalculateDue(call: Call, requestId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ reason: zReason() }), input);
  return store().transaction((db, now) => {
    reauth(db, a);
    const req = getRequest(db, requestId);
    const cycle = currentCycle(db, req);
    if (!isOpen(req.status) || !cycle) throw businessRule("Seule une demande ouverte peut voir son échéance recalculée.");
    if (cycle.first_response_at) throw businessRule("La première réponse a déjà été apportée : l’échéance n’a plus d’effet.");
    const policy = policyAt(db, now);
    const due = addWorkingMinutes(new Date(cycle.started_at), policy.response_target_working_minutes, calendarOfPolicy(policy, db.service_holidays));
    const before = { due_at: cycle.due_at, policy_id: cycle.policy_id };
    cycle.due_at = due.toISOString();
    cycle.policy_id = policy.id;
    req.due_at = cycle.due_at;
    req.updated_at = now.toISOString();
    audit(db, now, { actor_id: a.user.id, action: "DUE_DATE_RECALCULATED", entity_type: "coaching_request", entity_id: req.id, reason: data.reason, metadata: { before, after: { due_at: cycle.due_at, policy_id: policy.id } } });
    return { due_at: cycle.due_at };
  });
}

export async function setPriority(call: Call, requestId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN", "COACH");
  const data = parse(z.object({ priority: z.enum(PRIORITIES), reason: z.string().trim().max(300).optional().nullable() }), input);
  await store().transaction((db, now) => {
    reauth(db, a);
    const req = getRequest(db, requestId);
    if (a.actor.role === "COACH" && !canActAsCoach(a.actor, req)) throw forbidden();
    if (!isOpen(req.status)) throw businessRule("La priorité ne peut être modifiée que sur une demande ouverte.");
    if (req.priority === data.priority) return;
    const before = req.priority;
    req.priority = data.priority;
    req.updated_at = now.toISOString();
    audit(db, now, { actor_id: a.user.id, action: "REQUEST_PRIORITY_CHANGED", entity_type: "coaching_request", entity_id: req.id, reason: data.reason || null, metadata: { from: before, to: data.priority } });
  });
}

export async function nudgeCoach(call: Call, requestId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ message: zText(3, 300, "Le message") }), input);
  await store().transaction((db, now) => {
    reauth(db, a);
    const req = getRequest(db, requestId);
    const coach = findUser(db, req.coach_id);
    if (!coach) throw businessRule("Aucun coach n’est responsable de cette demande.");
    notify(db, now, {
      recipients: [coach],
      type: "ESCALATION",
      title: `Relance de l’administration (${req.reference})`,
      summary: data.message,
      requestId: req.id,
      eventKey: `NUDGE:${req.id}:${now.toISOString()}`,
    });
    audit(db, now, { actor_id: a.user.id, action: "COACH_NUDGED", entity_type: "coaching_request", entity_id: req.id, reason: data.message });
  });
}

// ---------------------------------------------------------------- pièces jointes

/** Téléchargement après contrôle d'accès (REC-17). Aucun lien permanent n'est exposé. */
export async function downloadAttachment(call: Call, attachmentId: string) {
  const a = await authenticate(call);
  const db = store().snapshot();
  const att = db.message_attachments.find((x) => x.id === attachmentId);
  if (!att) throw notFound("Pièce jointe introuvable.");
  const req = getRequest(db, att.request_id);
  assertCanViewRequest(a.actor, req);
  const file = await files().get(att.storage_key);
  if (!file) throw notFound("Le fichier n’est plus disponible.");
  return { data: file.data, mime: att.mime_type, filename: att.original_filename };
}
