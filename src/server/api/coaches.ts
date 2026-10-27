/**
 * Coachs (PRD §9.3, §9.6) : supervision admin, profil, disponibilités et absences.
 * Une indisponibilité ne modifie jamais une échéance existante.
 */
import { z } from "zod";
import { businessRule, forbidden, notFound } from "@/modules/core/errors";
import type { CoachAbsence, CoachAvailability, Database, User } from "@/modules/core/types";
import { coachCanViewLearner } from "@/modules/permissions/policies";
import { isOpen } from "@/modules/requests/stateMachine";
import { effectiveEntitlementStatus, quotaBalance } from "@/modules/entitlements/entitlements";
import { newId } from "../crypto";
import { activeAssignment, audit, currentEntitlement, getUser, userName } from "../db/helpers";
import { toPublicUser } from "./auth";
import { authenticate, parse, reauth, store, type Call } from "./context";
import { requestSla } from "./views";

const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide (HH:MM).");

function currentAbsence(db: Database, coachId: string, now: Date): CoachAbsence | undefined {
  const t = now.getTime();
  return db.coach_absences.find(
    (a) => a.coach_id === coachId && !a.cancelled_at && new Date(a.starts_at).getTime() <= t && new Date(a.ends_at).getTime() > t,
  );
}

function coachStats(db: Database, coach: User, now: Date) {
  const open = db.coaching_requests.filter((r) => r.coach_id === coach.id && isOpen(r.status));
  const overdue = open.filter((r) => requestSla(db, r, now)?.isOverdue).length;
  const ratings = db.coaching_ratings.filter((r) => r.coach_id === coach.id);
  return {
    open_requests: open.length,
    overdue_requests: overdue,
    awaiting_coach: open.filter((r) => ["SUBMITTED", "WAITING_FOR_COACH", "IN_PROGRESS"].includes(r.status)).length,
    assigned_learners: db.coach_assignments.filter((a) => a.coach_id === coach.id && a.status === "ACTIVE").length,
    average_rating: ratings.length ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length : null,
    ratings_count: ratings.length,
  };
}

function availabilityOf(db: Database, coachId: string) {
  return db.coach_availability
    .filter((a) => a.coach_id === coachId)
    .sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
}

function absencesOf(db: Database, coachId: string) {
  return db.coach_absences
    .filter((a) => a.coach_id === coachId && !a.cancelled_at)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
}

export async function listCoaches(call: Call) {
  await authenticate(call, "ADMIN");
  const db = store().snapshot();
  const now = store().now(db);
  return db.users
    .filter((u) => u.role === "COACH")
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "fr"))
    .map((c) => ({
      ...toPublicUser(c),
      profile: db.coach_profiles.find((p) => p.coach_id === c.id) ?? null,
      stats: coachStats(db, c, now),
      absent_now: currentAbsence(db, c.id, now) ?? null,
    }));
}

export async function getCoachDetail(call: Call, coachId: string) {
  await authenticate(call, "ADMIN");
  const db = store().snapshot();
  const now = store().now(db);
  const c = getUser(db, coachId);
  if (c.role !== "COACH") throw notFound("Coach introuvable.");
  return {
    coach: toPublicUser(c),
    profile: db.coach_profiles.find((p) => p.coach_id === c.id) ?? null,
    stats: coachStats(db, c, now),
    availability: availabilityOf(db, c.id),
    absences: absencesOf(db, c.id),
    absent_now: currentAbsence(db, c.id, now) ?? null,
    learners: db.coach_assignments
      .filter((a) => a.coach_id === c.id && a.status === "ACTIVE")
      .map((a) => ({ id: a.learner_id, full_name: userName(db, a.learner_id), since: a.started_at })),
  };
}

/** Coachs sélectionnables pour une affectation (actifs uniquement). */
export async function assignableCoaches(call: Call) {
  await authenticate(call, "ADMIN");
  const db = store().snapshot();
  const now = store().now(db);
  return db.users
    .filter((u) => u.role === "COACH" && u.status === "ACTIVE")
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "fr"))
    .map((c) => ({ id: c.id, full_name: c.full_name, stats: coachStats(db, c, now), absent_now: currentAbsence(db, c.id, now) ?? null }));
}

// ---------- Espace coach ----------

export async function myCoachSpace(call: Call) {
  const a = await authenticate(call, "COACH");
  const db = store().snapshot();
  const now = store().now(db);
  return {
    profile: db.coach_profiles.find((p) => p.coach_id === a.user.id) ?? null,
    availability: availabilityOf(db, a.user.id),
    absences: absencesOf(db, a.user.id),
    absent_now: currentAbsence(db, a.user.id, now) ?? null,
    stats: coachStats(db, a.user, now),
  };
}

export async function updateMyCoachProfile(call: Call, input: unknown) {
  const a = await authenticate(call, "COACH");
  const data = parse(
    z.object({
      bio: z.string().trim().max(1000, "1000 caractères maximum."),
      specialties: z.array(z.string().trim().min(2).max(60)).max(10),
    }),
    input,
  );
  await store().transaction((db, now) => {
    reauth(db, a);
    let p = db.coach_profiles.find((x) => x.coach_id === a.user.id);
    if (!p) {
      p = { coach_id: a.user.id, bio: "", specialties: [], updated_at: now.toISOString() };
      db.coach_profiles.push(p);
    }
    p.bio = data.bio;
    p.specialties = data.specialties;
    p.updated_at = now.toISOString();
  });
}

const zSlot = z
  .object({ day_of_week: z.number().int().min(1).max(7), start_time: zTime, end_time: zTime })
  .refine((s) => s.end_time > s.start_time, { message: "L’heure de fin doit suivre l’heure de début.", path: ["end_time"] });

export async function addAvailability(call: Call, input: unknown) {
  const a = await authenticate(call, "COACH");
  const data = parse(zSlot, input);
  await store().transaction((db, now) => {
    reauth(db, a);
    const overlapping = db.coach_availability.some(
      (s) => s.coach_id === a.user.id && s.is_active && s.day_of_week === data.day_of_week && s.start_time < data.end_time && data.start_time < s.end_time,
    );
    if (overlapping) throw businessRule("Ce créneau chevauche une disponibilité existante.");
    const iso = now.toISOString();
    const slot: CoachAvailability = { id: newId("avl"), coach_id: a.user.id, ...data, is_active: true, created_at: iso, updated_at: iso };
    db.coach_availability.push(slot);
  });
}

export async function toggleAvailability(call: Call, slotId: string, active: boolean) {
  const a = await authenticate(call, "COACH");
  await store().transaction((db, now) => {
    reauth(db, a);
    const s = db.coach_availability.find((x) => x.id === slotId);
    if (!s) throw notFound("Créneau introuvable.");
    if (s.coach_id !== a.user.id) throw forbidden();
    s.is_active = active;
    s.updated_at = now.toISOString();
  });
}

export async function deleteAvailability(call: Call, slotId: string) {
  const a = await authenticate(call, "COACH");
  await store().transaction((db) => {
    reauth(db, a);
    const s = db.coach_availability.find((x) => x.id === slotId);
    if (!s) throw notFound("Créneau introuvable.");
    if (s.coach_id !== a.user.id) throw forbidden();
    // Disponibilité récurrente = paramètre de confort, non historisé par le PRD.
    db.coach_availability = db.coach_availability.filter((x) => x.id !== slotId);
  });
}

export async function addAbsence(call: Call, input: unknown) {
  const a = await authenticate(call, "COACH");
  const data = parse(
    z
      .object({ starts_at: z.string().datetime(), ends_at: z.string().datetime(), reason: z.string().trim().max(300).optional().nullable() })
      .refine((x) => x.ends_at > x.starts_at, { message: "La fin doit être postérieure au début.", path: ["ends_at"] }),
    input,
  );
  await store().transaction((db, now) => {
    reauth(db, a);
    const overlap = db.coach_absences.some(
      (x) => x.coach_id === a.user.id && !x.cancelled_at && x.starts_at < data.ends_at && data.starts_at < x.ends_at,
    );
    if (overlap) throw businessRule("Cette absence chevauche une absence déjà déclarée.");
    const abs: CoachAbsence = {
      id: newId("abs"),
      coach_id: a.user.id,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      reason: data.reason || null,
      created_at: now.toISOString(),
      cancelled_at: null,
    };
    db.coach_absences.push(abs);
    audit(db, now, { actor_id: a.user.id, action: "COACH_ABSENCE_DECLARED", entity_type: "coach_absence", entity_id: abs.id, reason: abs.reason, metadata: { starts_at: abs.starts_at, ends_at: abs.ends_at } });
  });
}

export async function cancelAbsence(call: Call, absenceId: string) {
  const a = await authenticate(call, "COACH");
  await store().transaction((db, now) => {
    reauth(db, a);
    const abs = db.coach_absences.find((x) => x.id === absenceId);
    if (!abs) throw notFound("Absence introuvable.");
    if (abs.coach_id !== a.user.id) throw forbidden();
    abs.cancelled_at = now.toISOString();
    audit(db, now, { actor_id: a.user.id, action: "COACH_ABSENCE_CANCELLED", entity_type: "coach_absence", entity_id: abs.id, reason: null });
  });
}

export async function myLearners(call: Call) {
  const a = await authenticate(call, "COACH");
  const db = store().snapshot();
  const learnerIds = new Set<string>();
  for (const x of db.coach_assignments) if (x.coach_id === a.user.id && x.status === "ACTIVE") learnerIds.add(x.learner_id);
  for (const r of db.coaching_requests) if (r.coach_id === a.user.id && r.status !== "DRAFT") learnerIds.add(r.learner_id);
  return [...learnerIds]
    .map((id) => getUser(db, id))
    .sort((x, y) => x.full_name.localeCompare(y.full_name, "fr"))
    .map((l) => {
      const reqs = db.coaching_requests.filter((r) => r.learner_id === l.id && r.coach_id === a.user.id && r.status !== "DRAFT");
      const assignment = activeAssignment(db, l.id);
      return {
        id: l.id,
        full_name: l.full_name,
        status: l.status,
        is_assigned: assignment?.coach_id === a.user.id,
        assigned_since: assignment?.coach_id === a.user.id ? assignment.started_at : null,
        open_requests: reqs.filter((r) => isOpen(r.status)).length,
        total_requests: reqs.length,
        last_activity: reqs.reduce<string | null>((acc, r) => (acc === null || r.updated_at > acc ? r.updated_at : acc), null),
      };
    });
}

export async function coachLearnerDetail(call: Call, learnerId: string) {
  const a = await authenticate(call, "COACH");
  const db = store().snapshot();
  const now = store().now(db);
  if (!coachCanViewLearner(db, a.user.id, learnerId)) throw forbidden("Cet apprenant ne vous est pas affecté.");
  const l = getUser(db, learnerId);
  const ent = currentEntitlement(db, l.id);
  return {
    learner: { id: l.id, full_name: l.full_name, status: l.status },
    entitlement_status: effectiveEntitlementStatus(ent, now),
    quota: quotaBalance(ent, db.coaching_quota_ledger),
  };
}

// ---------- Espace apprenant ----------

export async function myCoach(call: Call) {
  const a = await authenticate(call, "LEARNER");
  const db = store().snapshot();
  const now = store().now(db);
  const asg = activeAssignment(db, a.user.id);
  if (!asg) return null;
  const c = getUser(db, asg.coach_id);
  const absence = currentAbsence(db, c.id, now);
  return {
    id: c.id,
    full_name: c.full_name,
    status: c.status,
    since: asg.started_at,
    profile: db.coach_profiles.find((p) => p.coach_id === c.id) ?? null,
    availability: availabilityOf(db, c.id).filter((s) => s.is_active),
    absent_until: absence ? absence.ends_at : null,
  };
}

