/**
 * Coachs (PRD §9.3, §9.6) sur PostgreSQL : supervision admin, profil, disponibilités et absences.
 * Une indisponibilité ne modifie jamais une échéance existante.
 */
import { and, asc, avg, count, desc, eq, gt, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { businessRule, forbidden, notFound } from "@/modules/core/errors";
import { parse } from "@/modules/core/validation";
import { effectiveEntitlementStatus, quotaBalance } from "@/modules/entitlements/entitlements";
import { isOpen } from "@/modules/requests/stateMachine";
import { newId } from "../crypto";
import { db } from "../pg/client";
import {
  coachAbsence,
  coachAssignment,
  coachAvailability,
  coachingEntitlement,
  coachingQuotaLedger,
  coachingRating,
  coachingRequest,
  coachProfile,
  user,
} from "../pg/schema";
import { authenticate, type LiveCall } from "./context";
import { audit, getUser, OPEN_STATUSES, toPublicUser, type Tx, type UserRowDb } from "./helpers";
import { toAbsence, toAvailability, toEntitlement, toLedgerEntry, toProfile } from "./mappers";
import { slaResolver } from "./sla";

const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (HH:MM).");
const AWAITING_COACH = ["SUBMITTED", "WAITING_FOR_COACH", "IN_PROGRESS"] as const;

type CoachStats = {
  open_requests: number;
  overdue_requests: number;
  awaiting_coach: number;
  assigned_learners: number;
  average_rating: number | null;
  ratings_count: number;
};

/** Indicateurs par coach, calculés par lot. */
async function coachStats(tx: Tx, coachIds: string[], now: Date): Promise<Map<string, CoachStats>> {
  const out = new Map<string, CoachStats>(
    coachIds.map((id) => [id, { open_requests: 0, overdue_requests: 0, awaiting_coach: 0, assigned_learners: 0, average_rating: null, ratings_count: 0 }]),
  );
  if (coachIds.length === 0) return out;

  const open = await tx
    .select()
    .from(coachingRequest)
    .where(and(inArray(coachingRequest.coachId, coachIds), inArray(coachingRequest.status, OPEN_STATUSES)));
  const sla = await slaResolver(tx, open, now);
  for (const r of open) {
    const st = out.get(r.coachId!)!;
    st.open_requests++;
    if (sla(r)?.isOverdue) st.overdue_requests++;
    if ((AWAITING_COACH as readonly string[]).includes(r.status)) st.awaiting_coach++;
  }

  const loads = await tx
    .select({ coachId: coachAssignment.coachId, n: count() })
    .from(coachAssignment)
    .where(and(inArray(coachAssignment.coachId, coachIds), eq(coachAssignment.status, "ACTIVE")))
    .groupBy(coachAssignment.coachId);
  for (const l of loads) out.get(l.coachId)!.assigned_learners = l.n;

  const ratings = await tx
    .select({ coachId: coachingRating.coachId, n: count(), avg: avg(coachingRating.score) })
    .from(coachingRating)
    .where(inArray(coachingRating.coachId, coachIds))
    .groupBy(coachingRating.coachId);
  for (const r of ratings) {
    const st = out.get(r.coachId)!;
    st.ratings_count = r.n;
    st.average_rating = r.avg === null ? null : Number(r.avg);
  }
  return out;
}

async function currentAbsences(tx: Tx, coachIds: string[], now: Date) {
  if (coachIds.length === 0) return new Map<string, ReturnType<typeof toAbsence>>();
  const rows = await tx
    .select()
    .from(coachAbsence)
    .where(and(inArray(coachAbsence.coachId, coachIds), isNull(coachAbsence.cancelledAt), lte(coachAbsence.startsAt, now), gt(coachAbsence.endsAt, now)));
  return new Map(rows.map((a) => [a.coachId, toAbsence(a)]));
}

async function profileOf(tx: Tx, coachId: string) {
  const [p] = await tx.select().from(coachProfile).where(eq(coachProfile.coachId, coachId));
  return p ? toProfile(p) : null;
}

async function availabilityOf(tx: Tx, coachId: string) {
  const rows = await tx
    .select()
    .from(coachAvailability)
    .where(eq(coachAvailability.coachId, coachId))
    .orderBy(asc(coachAvailability.dayOfWeek), asc(coachAvailability.startTime));
  return rows.map(toAvailability);
}

async function absencesOf(tx: Tx, coachId: string) {
  const rows = await tx
    .select()
    .from(coachAbsence)
    .where(and(eq(coachAbsence.coachId, coachId), isNull(coachAbsence.cancelledAt)))
    .orderBy(desc(coachAbsence.startsAt));
  return rows.map(toAbsence);
}

const byName = asc(sql`lower(${user.name})`);

export async function listCoaches(call: LiveCall) {
  await authenticate(call, "ADMIN");
  const now = new Date();
  const coaches = await db.select().from(user).where(eq(user.role, "COACH")).orderBy(byName);
  const ids = coaches.map((c) => c.id);
  const [stats, absences, profiles] = await Promise.all([
    coachStats(db, ids, now),
    currentAbsences(db, ids, now),
    ids.length ? db.select().from(coachProfile).where(inArray(coachProfile.coachId, ids)) : Promise.resolve([]),
  ]);
  const profileOfCoach = new Map(profiles.map((p) => [p.coachId, toProfile(p)]));
  return coaches.map((c) => ({
    ...toPublicUser(c),
    profile: profileOfCoach.get(c.id) ?? null,
    stats: stats.get(c.id)!,
    absent_now: absences.get(c.id) ?? null,
  }));
}

export async function getCoachDetail(call: LiveCall, coachId: string) {
  await authenticate(call, "ADMIN");
  const now = new Date();
  const c = await getUser(db, String(coachId));
  if (c.role !== "COACH") throw notFound("Coach introuvable.");
  const learners = await db
    .select({ id: user.id, full_name: user.name, since: coachAssignment.startedAt })
    .from(coachAssignment)
    .innerJoin(user, eq(user.id, coachAssignment.learnerId))
    .where(and(eq(coachAssignment.coachId, c.id), eq(coachAssignment.status, "ACTIVE")));
  return {
    coach: toPublicUser(c),
    profile: await profileOf(db, c.id),
    stats: (await coachStats(db, [c.id], now)).get(c.id)!,
    availability: await availabilityOf(db, c.id),
    absences: await absencesOf(db, c.id),
    absent_now: (await currentAbsences(db, [c.id], now)).get(c.id) ?? null,
    learners: learners.map((l) => ({ id: l.id, full_name: l.full_name, since: l.since.toISOString() })),
  };
}

/** Coachs sélectionnables pour une affectation (actifs uniquement). */
export async function assignableCoaches(call: LiveCall) {
  await authenticate(call, "ADMIN");
  const now = new Date();
  const coaches = await db.select().from(user).where(and(eq(user.role, "COACH"), eq(user.status, "ACTIVE"))).orderBy(byName);
  const ids = coaches.map((c) => c.id);
  const [stats, absences] = await Promise.all([coachStats(db, ids, now), currentAbsences(db, ids, now)]);
  return coaches.map((c) => ({ id: c.id, full_name: c.name, stats: stats.get(c.id)!, absent_now: absences.get(c.id) ?? null }));
}

// ---------- Espace coach ----------

export async function myCoachSpace(call: LiveCall) {
  const a = await authenticate(call, "COACH");
  const now = new Date();
  return {
    profile: await profileOf(db, a.user.id),
    availability: await availabilityOf(db, a.user.id),
    absences: await absencesOf(db, a.user.id),
    absent_now: (await currentAbsences(db, [a.user.id], now)).get(a.user.id) ?? null,
    stats: (await coachStats(db, [a.user.id], now)).get(a.user.id)!,
  };
}

export async function updateMyCoachProfile(call: LiveCall, input: unknown) {
  const a = await authenticate(call, "COACH");
  const data = parse(
    z.object({
      bio: z.string().trim().max(1000, "1000 caractères maximum."),
      specialties: z.array(z.string().trim().min(2).max(60)).max(10),
    }),
    input,
  );
  await db
    .insert(coachProfile)
    .values({ coachId: a.user.id, bio: data.bio, specialties: data.specialties })
    .onConflictDoUpdate({ target: coachProfile.coachId, set: { bio: data.bio, specialties: data.specialties, updatedAt: new Date() } });
}

const zSlot = z
  .object({ day_of_week: z.number().int().min(1).max(7), start_time: zTime, end_time: zTime })
  .refine((s) => s.end_time > s.start_time, { message: "L’heure de fin doit suivre l’heure de début.", path: ["end_time"] });

export async function addAvailability(call: LiveCall, input: unknown) {
  const a = await authenticate(call, "COACH");
  const data = parse(zSlot, input);
  await db.transaction(async (tx) => {
    // Verrou sur le coach : deux ajouts simultanés ne peuvent pas créer de chevauchement.
    await getUser(tx, a.user.id, { forUpdate: true });
    const [overlap] = await tx
      .select({ id: coachAvailability.id })
      .from(coachAvailability)
      .where(
        and(
          eq(coachAvailability.coachId, a.user.id),
          eq(coachAvailability.isActive, true),
          eq(coachAvailability.dayOfWeek, data.day_of_week),
          lt(coachAvailability.startTime, data.end_time),
          gt(coachAvailability.endTime, data.start_time),
        ),
      );
    if (overlap) throw businessRule("Ce créneau chevauche une disponibilité existante.");
    await tx.insert(coachAvailability).values({
      id: newId("avl"),
      coachId: a.user.id,
      dayOfWeek: data.day_of_week,
      startTime: data.start_time,
      endTime: data.end_time,
    });
  });
}

async function ownSlot(tx: Tx, coachId: string, slotId: string) {
  const [s] = await tx.select().from(coachAvailability).where(eq(coachAvailability.id, String(slotId)));
  if (!s) throw notFound("Créneau introuvable.");
  if (s.coachId !== coachId) throw forbidden();
  return s;
}

export async function toggleAvailability(call: LiveCall, slotId: string, active: boolean) {
  const a = await authenticate(call, "COACH");
  const s = await ownSlot(db, a.user.id, slotId);
  await db.update(coachAvailability).set({ isActive: !!active, updatedAt: new Date() }).where(eq(coachAvailability.id, s.id));
}

export async function deleteAvailability(call: LiveCall, slotId: string) {
  const a = await authenticate(call, "COACH");
  const s = await ownSlot(db, a.user.id, slotId);
  // Disponibilité récurrente = paramètre de confort, non historisé par le PRD.
  await db.delete(coachAvailability).where(eq(coachAvailability.id, s.id));
}

export async function addAbsence(call: LiveCall, input: unknown) {
  const a = await authenticate(call, "COACH");
  const data = parse(
    z
      .object({ starts_at: z.string().datetime(), ends_at: z.string().datetime(), reason: z.string().trim().max(300).optional().nullable() })
      .refine((x) => new Date(x.ends_at) > new Date(x.starts_at), { message: "La fin doit être postérieure au début.", path: ["ends_at"] }),
    input,
  );
  const startsAt = new Date(data.starts_at);
  const endsAt = new Date(data.ends_at);
  await db.transaction(async (tx) => {
    await getUser(tx, a.user.id, { forUpdate: true });
    const [overlap] = await tx
      .select({ id: coachAbsence.id })
      .from(coachAbsence)
      .where(and(eq(coachAbsence.coachId, a.user.id), isNull(coachAbsence.cancelledAt), lt(coachAbsence.startsAt, endsAt), gt(coachAbsence.endsAt, startsAt)));
    if (overlap) throw businessRule("Cette absence chevauche une absence déjà déclarée.");
    const id = newId("abs");
    const reason = data.reason || null;
    await tx.insert(coachAbsence).values({ id, coachId: a.user.id, startsAt, endsAt, reason });
    await audit(tx, {
      actor_id: a.user.id,
      action: "COACH_ABSENCE_DECLARED",
      entity_type: "coach_absence",
      entity_id: id,
      reason,
      metadata: { starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() },
    });
  });
}

export async function cancelAbsence(call: LiveCall, absenceId: string) {
  const a = await authenticate(call, "COACH");
  await db.transaction(async (tx) => {
    const [abs] = await tx.select().from(coachAbsence).where(eq(coachAbsence.id, String(absenceId))).for("update");
    if (!abs) throw notFound("Absence introuvable.");
    if (abs.coachId !== a.user.id) throw forbidden();
    await tx.update(coachAbsence).set({ cancelledAt: new Date() }).where(eq(coachAbsence.id, abs.id));
    await audit(tx, { actor_id: a.user.id, action: "COACH_ABSENCE_CANCELLED", entity_type: "coach_absence", entity_id: abs.id, reason: null });
  });
}

/** Apprenants visibles par le coach : affectés, ou dont il a traité une demande (PRD §9.6). */
export async function myLearners(call: LiveCall) {
  const a = await authenticate(call, "COACH");
  const assignments = await db
    .select()
    .from(coachAssignment)
    .where(and(eq(coachAssignment.coachId, a.user.id), eq(coachAssignment.status, "ACTIVE")));
  const requests = await db
    .select()
    .from(coachingRequest)
    .where(and(eq(coachingRequest.coachId, a.user.id), ne(coachingRequest.status, "DRAFT")));
  const ids = [...new Set([...assignments.map((x) => x.learnerId), ...requests.map((r) => r.learnerId)])];
  if (ids.length === 0) return [];
  const learners = await db.select().from(user).where(inArray(user.id, ids)).orderBy(byName);
  const assignedSince = new Map(assignments.map((x) => [x.learnerId, x.startedAt.toISOString()]));
  return learners.map((l) => {
    const reqs = requests.filter((r) => r.learnerId === l.id);
    return {
      id: l.id,
      full_name: l.name,
      status: l.status,
      is_assigned: assignedSince.has(l.id),
      assigned_since: assignedSince.get(l.id) ?? null,
      open_requests: reqs.filter((r) => isOpen(r.status)).length,
      total_requests: reqs.length,
      last_activity: reqs.reduce<string | null>((acc, r) => {
        const t = r.updatedAt.toISOString();
        return acc === null || t > acc ? t : acc;
      }, null),
    };
  });
}

/** Même règle que `coachCanViewLearner` (permissions/policies). */
async function coachCanViewLearner(tx: Tx, coachId: string, learnerId: string) {
  const [assigned] = await tx
    .select({ id: coachAssignment.id })
    .from(coachAssignment)
    .where(and(eq(coachAssignment.coachId, coachId), eq(coachAssignment.learnerId, learnerId), eq(coachAssignment.status, "ACTIVE")));
  if (assigned) return true;
  const [handled] = await tx
    .select({ id: coachingRequest.id })
    .from(coachingRequest)
    .where(and(eq(coachingRequest.coachId, coachId), eq(coachingRequest.learnerId, learnerId), ne(coachingRequest.status, "DRAFT")));
  return !!handled;
}

export async function coachLearnerDetail(call: LiveCall, learnerId: string) {
  const a = await authenticate(call, "COACH");
  if (!(await coachCanViewLearner(db, a.user.id, String(learnerId)))) throw forbidden("Cet apprenant ne vous est pas affecté.");
  const l = await getUser(db, String(learnerId));
  const [entRow] = await db
    .select()
    .from(coachingEntitlement)
    .where(and(eq(coachingEntitlement.learnerId, l.id), isNull(coachingEntitlement.supersededAt)));
  const ent = entRow ? toEntitlement(entRow) : undefined;
  const ledger = ent ? (await db.select().from(coachingQuotaLedger).where(eq(coachingQuotaLedger.entitlementId, ent.id))).map(toLedgerEntry) : [];
  return {
    learner: { id: l.id, full_name: l.name, status: l.status },
    entitlement_status: effectiveEntitlementStatus(ent, new Date()),
    quota: quotaBalance(ent, ledger),
  };
}

// ---------- Espace apprenant ----------

export async function myCoach(call: LiveCall) {
  const a = await authenticate(call, "LEARNER");
  const now = new Date();
  const [asg] = await db
    .select()
    .from(coachAssignment)
    .where(and(eq(coachAssignment.learnerId, a.user.id), eq(coachAssignment.status, "ACTIVE")));
  if (!asg) return null;
  const c: UserRowDb = await getUser(db, asg.coachId);
  const absence = (await currentAbsences(db, [c.id], now)).get(c.id);
  return {
    id: c.id,
    full_name: c.name,
    status: c.status,
    since: asg.startedAt.toISOString(),
    profile: await profileOf(db, c.id),
    availability: (await availabilityOf(db, c.id)).filter((s) => s.is_active),
    absent_until: absence ? absence.ends_at : null,
  };
}
