/** Projections (DTO) partagées. Ne jamais y inclure de données réservées (notes, hash…). */
import type { CoachingRequest, Database, Role } from "@/modules/core/types";
import { computeSla, isDueSoon, type SlaState } from "@/modules/deadlines/sla";
import { currentCycle, findUser, policyById, userName } from "../db/helpers";

export function requestSla(db: Database, req: CoachingRequest, now: Date): SlaState | null {
  const cycle = currentCycle(db, req);
  if (!cycle) return null;
  return computeSla(cycle, req.status, policyById(db, cycle.policy_id), db.service_holidays, now);
}

export function unreadCount(db: Database, req: CoachingRequest, userId: string): number {
  const read = db.request_reads.find((r) => r.request_id === req.id && r.user_id === userId);
  return db.coaching_messages.filter(
    (m) => m.request_id === req.id && m.sender_id !== userId && m.kind === "USER" && (!read || m.created_at > read.last_read_at),
  ).length;
}

export function requestSummary(db: Database, req: CoachingRequest, now: Date, viewer: { id: string; role: Role }) {
  const sla = requestSla(db, req, now);
  const category = db.coaching_categories.find((c) => c.id === req.category_id);
  const lastMessage = db.coaching_messages
    .filter((m) => m.request_id === req.id && m.kind === "USER")
    .reduce<string | null>((acc, m) => (acc === null || m.created_at > acc ? m.created_at : acc), null);
  const coach = findUser(db, req.coach_id);
  return {
    id: req.id,
    reference: req.reference,
    subject: req.subject,
    status: req.status,
    priority: req.priority,
    category: category ? { id: category.id, name: category.name } : null,
    learner: { id: req.learner_id, full_name: userName(db, req.learner_id) },
    coach: coach ? { id: coach.id, full_name: coach.full_name, status: coach.status } : null,
    created_at: req.created_at,
    submitted_at: req.submitted_at,
    first_response_at: req.first_response_at,
    due_at: req.due_at,
    closed_at: req.closed_at,
    updated_at: req.updated_at,
    cycle_number: req.current_cycle_number,
    last_message_at: lastMessage,
    unread: unreadCount(db, req, viewer.id),
    sla: sla
      ? {
          is_overdue: sla.isOverdue,
          due_soon: isDueSoon(sla),
          awaiting_first_response: sla.awaitingFirstResponse,
          elapsed_minutes: sla.elapsedMinutes,
          target_minutes: sla.targetMinutes,
          overdue_minutes: sla.overdueMinutes,
          responded_on_time: sla.respondedOnTime,
          ratio: sla.ratio,
        }
      : null,
  };
}
export type RequestSummary = ReturnType<typeof requestSummary>;
