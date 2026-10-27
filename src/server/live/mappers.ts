/**
 * Conversion des lignes Drizzle (camelCase, Date) vers les types du domaine (snake_case, ISO),
 * afin que les modules purs de `src/modules` s'appliquent sans modification.
 */
import type {
  CoachAbsence,
  CoachAssignment,
  CoachAvailability,
  CoachingEntitlement,
  CoachingRequest,
  CoachProfile,
  QuotaLedgerEntry,
  RequestCycle,
  ServiceHoliday,
  ServicePolicy,
  User,
} from "@/modules/core/types";
import type * as s from "../pg/schema";

export const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toDomainUser(u: typeof s.user.$inferSelect): User {
  return {
    id: u.id,
    full_name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    created_at: u.createdAt.toISOString(),
    updated_at: u.updatedAt.toISOString(),
    last_login_at: iso(u.lastLoginAt),
    is_demo: u.isDemo,
  };
}

export function toAssignment(a: typeof s.coachAssignment.$inferSelect): CoachAssignment {
  return {
    id: a.id,
    learner_id: a.learnerId,
    coach_id: a.coachId,
    assigned_by: a.assignedBy,
    started_at: a.startedAt.toISOString(),
    ended_at: iso(a.endedAt),
    ended_by: a.endedBy,
    status: a.status,
    reason: a.reason,
    end_reason: a.endReason,
    created_at: a.createdAt.toISOString(),
  };
}

export function toEntitlement(e: typeof s.coachingEntitlement.$inferSelect): CoachingEntitlement {
  return {
    id: e.id,
    learner_id: e.learnerId,
    status: e.status,
    starts_at: e.startsAt.toISOString(),
    expires_at: iso(e.expiresAt),
    quota_enabled: e.quotaEnabled,
    quota_limit: e.quotaLimit,
    superseded_at: iso(e.supersededAt),
    created_by: e.createdBy,
    updated_by: e.updatedBy,
    created_at: e.createdAt.toISOString(),
    updated_at: e.updatedAt.toISOString(),
  };
}

export function toLedgerEntry(e: typeof s.coachingQuotaLedger.$inferSelect): QuotaLedgerEntry {
  return {
    id: e.id,
    learner_id: e.learnerId,
    entitlement_id: e.entitlementId,
    request_id: e.requestId,
    entry_type: e.entryType,
    quantity: e.quantity,
    reason: e.reason,
    created_by: e.createdBy,
    created_at: e.createdAt.toISOString(),
    idempotency_key: e.idempotencyKey,
  };
}

export function toProfile(p: typeof s.coachProfile.$inferSelect): CoachProfile {
  return { coach_id: p.coachId, bio: p.bio, specialties: p.specialties, updated_at: p.updatedAt.toISOString() };
}

export function toAvailability(a: typeof s.coachAvailability.$inferSelect): CoachAvailability {
  return {
    id: a.id,
    coach_id: a.coachId,
    day_of_week: a.dayOfWeek,
    start_time: a.startTime,
    end_time: a.endTime,
    is_active: a.isActive,
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
  };
}

export function toAbsence(a: typeof s.coachAbsence.$inferSelect): CoachAbsence {
  return {
    id: a.id,
    coach_id: a.coachId,
    starts_at: a.startsAt.toISOString(),
    ends_at: a.endsAt.toISOString(),
    reason: a.reason,
    created_at: a.createdAt.toISOString(),
    cancelled_at: iso(a.cancelledAt),
  };
}

export function toRequest(r: typeof s.coachingRequest.$inferSelect): CoachingRequest {
  return {
    id: r.id,
    reference: r.reference,
    learner_id: r.learnerId,
    coach_id: r.coachId,
    category_id: r.categoryId,
    subject: r.subject,
    description: r.description,
    priority: r.priority,
    status: r.status,
    submitted_at: iso(r.submittedAt),
    first_response_at: iso(r.firstResponseAt),
    due_at: iso(r.dueAt),
    closed_at: iso(r.closedAt),
    current_cycle_number: r.currentCycleNumber,
    submit_idempotency_key: r.submitIdempotencyKey,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  };
}

export function toCycle(c: typeof s.coachingRequestCycle.$inferSelect): RequestCycle {
  return {
    id: c.id,
    request_id: c.requestId,
    cycle_number: c.cycleNumber,
    started_at: c.startedAt.toISOString(),
    closed_at: iso(c.closedAt),
    closed_by: c.closedBy,
    assigned_coach_id: c.assignedCoachId,
    first_response_at: iso(c.firstResponseAt),
    first_response_by: c.firstResponseBy,
    due_at: c.dueAt.toISOString(),
    policy_id: c.policyId,
    reopened_by: c.reopenedBy,
    reopen_reason: c.reopenReason,
    created_at: c.createdAt.toISOString(),
  };
}

export function toPolicy(p: typeof s.servicePolicy.$inferSelect): ServicePolicy {
  return {
    id: p.id,
    calendar_id: p.calendarId,
    response_target_working_minutes: p.responseTargetWorkingMinutes,
    reminder_50_enabled: p.reminder50Enabled,
    reminder_75_enabled: p.reminder75Enabled,
    overdue_escalation_working_minutes: p.overdueEscalationWorkingMinutes,
    calendar_snapshot: p.calendarSnapshot,
    effective_from: p.effectiveFrom.toISOString(),
    created_by: p.createdBy,
    created_at: p.createdAt.toISOString(),
  };
}

export function toHoliday(h: typeof s.serviceHoliday.$inferSelect): ServiceHoliday {
  return { id: h.id, calendar_id: h.calendarId, holiday_date: h.holidayDate, label: h.label, created_at: h.createdAt.toISOString() };
}
