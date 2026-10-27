/**
 * Indicateurs (PRD §3.2, §9.12) calculés exclusivement à partir des données persistées.
 *
 * Définitions (à ne pas confondre) :
 * - 1ʳᵉ réponse : temps OUVRÉ entre le début du cycle et la 1ʳᵉ réponse humaine du coach.
 * - Résolution : temps OUVRÉ entre le début du cycle et sa clôture (+ équivalent calendaire).
 * - Attente apprenant : temps OUVRÉ passé au statut « En attente de l’apprenant » dans le cycle.
 * - Résolution nette : résolution − attente apprenant.
 * - Les statistiques sont calculées PAR CYCLE (une réouverture crée un nouveau cycle).
 */
import type { CoachingRequest, Database, RequestCycle, RequestStatus } from "../core/types";
import { workingMinutesBetween } from "../deadlines/businessHours";
import { calendarOfPolicy, computeSla } from "../deadlines/sla";
import { quotaBalance } from "../entitlements/entitlements";
import { isOpen } from "../requests/stateMachine";

export interface MetricsFilter {
  from: Date;
  to: Date;
  coachId?: string;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function policyOf(db: Database, cycle: RequestCycle) {
  return db.service_policies.find((p) => p.id === cycle.policy_id)!;
}

/** Minutes ouvrées passées en WAITING_FOR_LEARNER pendant un cycle. */
export function learnerWaitingMinutes(db: Database, cycle: RequestCycle, now: Date): number {
  const cal = calendarOfPolicy(policyOf(db, cycle), db.service_holidays);
  const hist = db.request_status_history
    .filter((h) => h.cycle_id === cycle.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  let total = 0;
  let waitingSince: Date | null = null;
  for (const h of hist) {
    if (h.new_status === "WAITING_FOR_LEARNER" && !waitingSince) waitingSince = new Date(h.created_at);
    else if (h.new_status !== "WAITING_FOR_LEARNER" && waitingSince) {
      total += workingMinutesBetween(waitingSince, new Date(h.created_at), cal);
      waitingSince = null;
    }
  }
  if (waitingSince) total += workingMinutesBetween(waitingSince, cycle.closed_at ? new Date(cycle.closed_at) : now, cal);
  return total;
}

export function computeMetrics(db: Database, f: MetricsFilter, now: Date) {
  const inPeriod = (iso: string | null) => !!iso && iso >= f.from.toISOString() && iso <= f.to.toISOString();
  const coachOk = (r: CoachingRequest) => !f.coachId || r.coach_id === f.coachId;
  const reqById = new Map(db.coaching_requests.map((r) => [r.id, r]));

  const requests = db.coaching_requests.filter((r) => r.status !== "DRAFT" && inPeriod(r.submitted_at) && coachOk(r));
  const allOpen = db.coaching_requests.filter((r) => isOpen(r.status) && coachOk(r));

  const slaOf = (r: CoachingRequest) => {
    const c = db.coaching_request_cycles.find((x) => x.request_id === r.id && x.cycle_number === r.current_cycle_number);
    return c ? computeSla(c, r.status, policyOf(db, c), db.service_holidays, now) : null;
  };
  const overdueNow = allOpen.filter((r) => slaOf(r)?.isOverdue);

  // Cycles démarrés dans la période (y compris réouvertures).
  const cycles = db.coaching_request_cycles.filter((c) => {
    const r = reqById.get(c.request_id);
    return !!r && inPeriod(c.started_at) && (!f.coachId || c.assigned_coach_id === f.coachId);
  });

  /**
   * Taux de réponse dans les délais — définition unique (global et par coach) :
   * cycles ayant reçu une 1ʳᵉ réponse + cycles dont l'échéance est dépassée sans réponse (hors annulés).
   */
  const onTimeStats = (list: RequestCycle[]) => {
    let onTime = 0;
    let measured = 0;
    const minutes: number[] = [];
    for (const c of list) {
      if (c.first_response_at) {
        minutes.push(workingMinutesBetween(new Date(c.started_at), new Date(c.first_response_at), calendarOfPolicy(policyOf(db, c), db.service_holidays)));
        measured++;
        if (c.first_response_at <= c.due_at) onTime++;
      } else if (now.toISOString() > c.due_at && reqById.get(c.request_id)!.status !== "CANCELLED") {
        measured++;
      }
    }
    return { onTime, measured, minutes };
  };
  const global = onTimeStats(cycles);
  const firstResponseMinutes = global.minutes;
  const onTime = global.onTime;
  const measured = global.measured;

  const closedCycles = cycles.filter((c) => c.closed_at);
  const resolution: number[] = [];
  const resolutionCalendarHours: number[] = [];
  const waiting: number[] = [];
  const net: number[] = [];
  for (const c of closedCycles) {
    const cal = calendarOfPolicy(policyOf(db, c), db.service_holidays);
    const total = workingMinutesBetween(new Date(c.started_at), new Date(c.closed_at!), cal);
    const w = learnerWaitingMinutes(db, c, now);
    resolution.push(total);
    waiting.push(w);
    net.push(Math.max(0, total - w));
    resolutionCalendarHours.push((new Date(c.closed_at!).getTime() - new Date(c.started_at).getTime()) / 3600_000);
  }

  const cycleIds = new Set(closedCycles.map((c) => c.id));
  const ratings = db.coaching_ratings.filter((r) => cycleIds.has(r.cycle_id));

  const byStatus: Partial<Record<RequestStatus, number>> = {};
  for (const r of requests) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

  const coaches = db.users.filter((u) => u.role === "COACH" && (!f.coachId || u.id === f.coachId));
  const byCoach = coaches.map((c) => {
    const mine = requests.filter((r) => r.coach_id === c.id);
    const myCycles = cycles.filter((x) => x.assigned_coach_id === c.id);
    const mine2 = onTimeStats(myCycles);
    const myRatings = db.coaching_ratings.filter((x) => x.coach_id === c.id && myCycles.some((y) => y.id === x.cycle_id));
    return {
      coach_id: c.id,
      coach_name: c.full_name,
      coach_status: c.status,
      received: mine.length,
      open_now: allOpen.filter((r) => r.coach_id === c.id).length,
      overdue_now: overdueNow.filter((r) => r.coach_id === c.id).length,
      closed: mine.filter((r) => r.status === "CLOSED").length,
      avg_first_response_minutes: avg(mine2.minutes),
      on_time_rate: mine2.measured ? mine2.onTime / mine2.measured : null,
      avg_rating: avg(myRatings.map((x) => x.score)),
    };
  });

  const byCategory = db.coaching_categories.map((cat) => ({
    category_id: cat.id,
    name: cat.name,
    count: requests.filter((r) => r.category_id === cat.id).length,
  }));

  // Quotas : droits courants avec quota activé.
  let quotaUsed = 0;
  let quotaTotal = 0;
  let quotaLearners = 0;
  for (const e of db.coaching_entitlements) {
    if (e.superseded_at || !e.quota_enabled) continue;
    const b = quotaBalance(e, db.coaching_quota_ledger);
    quotaUsed += b.used;
    quotaTotal += (b.limit ?? 0) + b.corrections;
    quotaLearners++;
  }

  return {
    period: { from: f.from.toISOString(), to: f.to.toISOString() },
    received: requests.length,
    open_now: allOpen.length,
    overdue_now: overdueNow.length,
    open_in_period: requests.filter((r) => isOpen(r.status)).length,
    closed: requests.filter((r) => r.status === "CLOSED").length,
    cancelled: requests.filter((r) => r.status === "CANCELLED").length,
    reopened: cycles.filter((c) => c.cycle_number > 1).length,
    by_status: byStatus,
    by_coach: byCoach,
    by_category: byCategory,
    first_response: {
      avg_working_minutes: avg(firstResponseMinutes),
      measured,
      on_time: onTime,
      on_time_rate: measured ? onTime / measured : null,
    },
    resolution: {
      cycles: closedCycles.length,
      avg_working_minutes: avg(resolution),
      avg_calendar_hours: avg(resolutionCalendarHours),
      avg_learner_waiting_minutes: avg(waiting),
      avg_net_working_minutes: avg(net),
    },
    satisfaction: {
      avg_score: avg(ratings.map((r) => r.score)),
      ratings: ratings.length,
      rating_rate: closedCycles.length ? ratings.length / closedCycles.length : null,
    },
    quota: { learners: quotaLearners, used: quotaUsed, total: quotaTotal, usage_rate: quotaTotal ? quotaUsed / quotaTotal : null },
  };
}
export type Metrics = ReturnType<typeof computeMetrics>;
