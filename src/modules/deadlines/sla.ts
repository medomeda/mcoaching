/**
 * Indicateurs de délai (PRD §7.3, §7.4). Le retard est CALCULÉ, jamais stocké comme statut.
 * L'échéance utilisée est celle enregistrée sur le cycle (jamais recalculée silencieusement).
 */
import { workingMinutesBetween, type CalendarConfig } from "./businessHours";
import type { RequestCycle, RequestStatus, ServiceHoliday, ServicePolicy } from "../core/types";
import { isOpen } from "../requests/stateMachine";

export function calendarOfPolicy(policy: ServicePolicy, holidays: ServiceHoliday[]): CalendarConfig {
  return {
    timezone: policy.calendar_snapshot.timezone,
    working_days: policy.calendar_snapshot.working_days,
    periods: policy.calendar_snapshot.periods,
    holidays: holidays.filter((h) => h.calendar_id === policy.calendar_id).map((h) => h.holiday_date),
  };
}

export interface SlaState {
  targetMinutes: number;
  /** Temps ouvré écoulé depuis le début du cycle jusqu'à la 1ʳᵉ réponse (ou maintenant). */
  elapsedMinutes: number;
  ratio: number;
  awaitingFirstResponse: boolean;
  isOverdue: boolean;
  overdueMinutes: number;
  /** null tant qu'aucune réponse n'a été apportée. */
  respondedOnTime: boolean | null;
  dueAt: string;
}

export function computeSla(
  cycle: RequestCycle,
  status: RequestStatus,
  policy: ServicePolicy,
  holidays: ServiceHoliday[],
  now: Date,
): SlaState {
  const cal = calendarOfPolicy(policy, holidays);
  const start = new Date(cycle.started_at);
  const due = new Date(cycle.due_at);
  const responded = cycle.first_response_at ? new Date(cycle.first_response_at) : null;
  const awaiting = !responded && isOpen(status) && cycle.closed_at === null;
  const end = responded ?? (awaiting ? now : new Date(cycle.closed_at ?? now.toISOString()));
  const elapsed = workingMinutesBetween(start, end, cal);
  const target = policy.response_target_working_minutes;
  const isOverdue = awaiting && now.getTime() > due.getTime();
  return {
    targetMinutes: target,
    elapsedMinutes: elapsed,
    ratio: target > 0 ? elapsed / target : 0,
    awaitingFirstResponse: awaiting,
    isOverdue,
    overdueMinutes: isOverdue ? workingMinutesBetween(due, now, cal) : 0,
    respondedOnTime: responded ? responded.getTime() <= due.getTime() : null,
    dueAt: cycle.due_at,
  };
}

/** Échéance « proche » : plus de 75 % du délai consommé, sans retard. */
export function isDueSoon(sla: SlaState): boolean {
  return sla.awaitingFirstResponse && !sla.isOverdue && sla.ratio >= 0.75;
}
