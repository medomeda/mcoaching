/** Tableaux de bord, rapports, exports (PRD §9.12, §10.2, §10.3) et journal d'audit (§12.20). */
import { z } from "zod";
import { toCsv } from "@/modules/reporting/csv";
import { computeMetrics } from "@/modules/reporting/metrics";
import { isOpen, STATUS_LABELS } from "@/modules/requests/stateMachine";
import { audit, paginate, userName } from "../db/helpers";
import { authenticate, parse, store, type Call } from "./context";
import { needsAttention } from "./requests";
import { requestSummary } from "./views";

export { toCsv };

const zPeriod = z.object({ from: z.string().datetime(), to: z.string().datetime(), coachId: z.string().optional() });

export async function adminDashboard(call: Call, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const p = parse(zPeriod, input);
  const db = store().snapshot();
  const now = store().now(db);
  const metrics = computeMetrics(db, { from: new Date(p.from), to: new Date(p.to) }, now);
  const open = db.coaching_requests.filter((r) => isOpen(r.status)).map((r) => ({ r, s: requestSummary(db, r, now, a.actor) }));
  const attention = open
    .map(({ r, s }) => ({ ...s, attention: needsAttention(db, r, s, now) }))
    .filter((x) => x.attention.length > 0)
    .sort((x, y) => (x.submitted_at ?? "").localeCompare(y.submitted_at ?? ""));
  const oldest = open
    .map(({ s }) => s)
    .sort((x, y) => (x.submitted_at ?? "").localeCompare(y.submitted_at ?? ""))
    .slice(0, 8);
  return { metrics, attention: attention.slice(0, 15), attention_total: attention.length, oldest, now: now.toISOString() };
}

export async function reportMetrics(call: Call, input: unknown) {
  await authenticate(call, "ADMIN");
  const p = parse(zPeriod, input);
  const db = store().snapshot();
  return computeMetrics(db, { from: new Date(p.from), to: new Date(p.to), coachId: p.coachId }, store().now(db));
}

export async function coachDashboard(call: Call) {
  const a = await authenticate(call, "COACH");
  const db = store().snapshot();
  const now = store().now(db);
  const mine = db.coaching_requests.filter((r) => r.coach_id === a.user.id && r.status !== "DRAFT");
  const summaries = mine.map((r) => requestSummary(db, r, now, a.actor));
  const open = summaries.filter((s) => isOpen(s.status));
  const lastMessages = db.coaching_messages
    .filter((m) => m.kind === "USER" && m.sender_id !== a.user.id && mine.some((r) => r.id === m.request_id))
    .sort((x, y) => y.created_at.localeCompare(x.created_at))
    .slice(0, 6)
    .map((m) => {
      const r = mine.find((x) => x.id === m.request_id)!;
      return { id: m.id, request_id: r.id, reference: r.reference, subject: r.subject, sender: userName(db, m.sender_id), created_at: m.created_at, excerpt: m.body.slice(0, 140) };
    });
  const ratings = db.app_settings.coach_can_view_ratings ? db.coaching_ratings.filter((r) => r.coach_id === a.user.id) : [];
  return {
    counts: {
      todo: open.filter((s) => ["SUBMITTED", "WAITING_FOR_COACH", "IN_PROGRESS"].includes(s.status)).length,
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
    last_messages: lastMessages,
    ratings: db.app_settings.coach_can_view_ratings
      ? {
          count: ratings.length,
          average: ratings.length ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length : null,
          recent: ratings
            .sort((x, y) => y.created_at.localeCompare(x.created_at))
            .slice(0, 5)
            .map((r) => ({ score: r.score, comment: r.comment, created_at: r.created_at, reference: db.coaching_requests.find((q) => q.id === r.request_id)?.reference ?? "" })),
        }
      : null,
  };
}

export async function learnerDashboard(call: Call) {
  const a = await authenticate(call, "LEARNER");
  const db = store().snapshot();
  const now = store().now(db);
  const mine = db.coaching_requests.filter((r) => r.learner_id === a.user.id);
  const summaries = mine.map((r) => requestSummary(db, r, now, a.actor));
  return {
    open: summaries.filter((s) => isOpen(s.status)).sort((x, y) => y.updated_at.localeCompare(x.updated_at)),
    drafts: summaries.filter((s) => s.status === "DRAFT"),
    recently_closed: summaries
      .filter((s) => s.status === "CLOSED")
      .sort((x, y) => (y.closed_at ?? "").localeCompare(x.closed_at ?? ""))
      .slice(0, 5)
      .map((s) => ({ ...s, rated: db.coaching_ratings.some((r) => r.request_id === s.id && r.cycle_number === s.cycle_number) })),
    last_messages: db.coaching_messages
      .filter((m) => m.kind === "USER" && m.sender_id !== a.user.id && mine.some((r) => r.id === m.request_id))
      .sort((x, y) => y.created_at.localeCompare(x.created_at))
      .slice(0, 5)
      .map((m) => {
        const r = mine.find((x) => x.id === m.request_id)!;
        return { id: m.id, request_id: r.id, reference: r.reference, sender: userName(db, m.sender_id), created_at: m.created_at, excerpt: m.body.slice(0, 140) };
      }),
  };
}

/** Export des demandes de la période — métadonnées uniquement, jamais le contenu des échanges. */
export async function exportRequestsCsv(call: Call, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const p = parse(zPeriod, input);
  const db = store().snapshot();
  const now = store().now(db);
  const rows = db.coaching_requests
    .filter((r) => r.status !== "DRAFT" && r.submitted_at && r.submitted_at >= p.from && r.submitted_at <= p.to)
    .filter((r) => !p.coachId || r.coach_id === p.coachId)
    .sort((x, y) => (x.submitted_at ?? "").localeCompare(y.submitted_at ?? ""))
    .map((r) => {
      const s = requestSummary(db, r, now, a.actor);
      return {
        reference: r.reference,
        sujet: r.subject,
        categorie: s.category?.name ?? "",
        apprenant: s.learner.full_name,
        coach: s.coach?.full_name ?? "",
        priorite: r.priority,
        statut: STATUS_LABELS[r.status],
        cycle: r.current_cycle_number,
        soumise_le: r.submitted_at,
        echeance: r.due_at,
        premiere_reponse: r.first_response_at ?? "",
        en_retard: s.sla?.is_overdue ? "oui" : "non",
        reponse_dans_les_delais: s.sla?.responded_on_time === null ? "" : s.sla?.responded_on_time ? "oui" : "non",
        cloturee_le: r.closed_at ?? "",
      };
    });
  await store().transaction((d, n) => audit(d, n, { actor_id: a.user.id, action: "REPORT_EXPORTED", entity_type: "report", entity_id: null, reason: null, metadata: { from: p.from, to: p.to, rows: rows.length } }));
  return toCsv(rows);
}

export async function listAuditLogs(call: Call, input: unknown) {
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
  const db = store().snapshot();
  const q = f.q?.toLowerCase();
  const items = db.audit_logs
    .filter((l) => !f.action || l.action === f.action)
    .filter((l) => !f.entityType || l.entity_type === f.entityType)
    .filter((l) => !f.actorId || l.actor_id === f.actorId)
    .filter((l) => !f.from || l.created_at >= f.from)
    .filter((l) => !f.to || l.created_at <= f.to)
    .map((l) => ({ ...l, actor_name: userName(db, l.actor_id), entity_label: entityLabel(db, l.entity_type, l.entity_id) }))
    .filter((l) => !q || l.actor_name.toLowerCase().includes(q) || (l.reason ?? "").toLowerCase().includes(q) || (l.entity_label ?? "").toLowerCase().includes(q))
    .sort((x, y) => y.created_at.localeCompare(x.created_at));
  return {
    ...paginate(items, f.page, f.pageSize),
    actions: [...new Set(db.audit_logs.map((l) => l.action))].sort(),
    entity_types: [...new Set(db.audit_logs.map((l) => l.entity_type))].sort(),
  };
}

function entityLabel(db: ReturnType<ReturnType<typeof store>["snapshot"]>, type: string, id: string | null): string | null {
  if (!id) return null;
  if (type === "user") return userName(db, id);
  if (type === "coaching_request") return db.coaching_requests.find((r) => r.id === id)?.reference ?? id;
  if (type === "coaching_entitlement") {
    const e = db.coaching_entitlements.find((x) => x.id === id);
    return e ? `Droit de ${userName(db, e.learner_id)}` : id;
  }
  if (type === "coach_assignment") {
    const x = db.coach_assignments.find((y) => y.id === id);
    return x ? `${userName(db, x.learner_id)} → ${userName(db, x.coach_id)}` : id;
  }
  return id;
}
