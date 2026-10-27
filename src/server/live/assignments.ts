/**
 * Affectations coach ⇄ apprenant (PRD §7.1, §9.4) sur PostgreSQL. Manuelles, historisées,
 * au plus une affectation principale active par apprenant (index unique partiel en base).
 */
import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { businessRule } from "@/modules/core/errors";
import { parse } from "@/modules/core/validation";
import { newId } from "../crypto";
import { db } from "../pg/client";
import { coachAssignment, coachingRequest, user } from "../pg/schema";
import { authenticate, type LiveCall } from "./context";
import { audit, getUser, nameIn, namesOf, notify, OPEN_STATUSES, pageOf, userSearch, type Tx } from "./helpers";
import { toAssignment } from "./mappers";
import { reassignRequestInTx } from "./requests";

const coach = alias(user, "coach");
const openCount = (extra?: SQL) =>
  sql<number>`(select count(*)::int from ${coachingRequest} r
    where r.learner_id = ${user.id}
      and r.status in (${sql.join(OPEN_STATUSES.map((s) => sql`${s}`), sql`, `)})
      ${extra ?? sql``})`;

export async function assignmentOverview(call: LiveCall, input: unknown) {
  await authenticate(call, "ADMIN");
  const f = parse(
    z.object({
      q: z.string().trim().max(100).optional(),
      onlyUnassigned: z.boolean().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }),
    input ?? {},
  );
  const filters: SQL[] = [eq(user.role, "LEARNER")];
  const search = userSearch(f.q);
  if (search) filters.push(search);
  if (f.onlyUnassigned) filters.push(isNull(coachAssignment.id));
  const where = and(...filters);
  const joinActive = and(eq(coachAssignment.learnerId, user.id), eq(coachAssignment.status, "ACTIVE"));

  const total =
    (await db.select({ n: count() }).from(user).leftJoin(coachAssignment, joinActive).where(where))[0]?.n ?? 0;
  const { page, pages } = pageOf(total, f.page, f.pageSize);
  const rows = await db
    .select({
      learner: { id: user.id, full_name: user.name, email: user.email, status: user.status },
      assignment: coachAssignment,
      coachName: coach.name,
      open: openCount(),
      openOther: openCount(sql`and r.coach_id is distinct from ${coachAssignment.coachId}`),
    })
    .from(user)
    .leftJoin(coachAssignment, joinActive)
    .leftJoin(coach, eq(coach.id, coachAssignment.coachId))
    .where(where)
    .orderBy(asc(sql`lower(${user.name})`), asc(user.id))
    .limit(f.pageSize)
    .offset((page - 1) * f.pageSize);

  return {
    items: rows.map((r) => ({
      learner: r.learner,
      assignment: r.assignment ? { ...toAssignment(r.assignment), coach_name: r.coachName ?? "Utilisateur inconnu" } : null,
      open_requests: r.open,
      open_requests_other_coach: r.assignment ? r.openOther : 0,
    })),
    total,
    page,
    pageSize: f.pageSize,
    pages,
  };
}

export async function assignmentHistory(call: LiveCall, learnerId: string) {
  await authenticate(call, "ADMIN");
  const rows = await db
    .select()
    .from(coachAssignment)
    .where(eq(coachAssignment.learnerId, String(learnerId)))
    .orderBy(desc(coachAssignment.startedAt));
  const names = await namesOf(db, rows.flatMap((a) => [a.coachId, a.assignedBy, a.endedBy]));
  return rows.map((a) => ({
    ...toAssignment(a),
    coach_name: nameIn(names, a.coachId),
    assigned_by_name: nameIn(names, a.assignedBy),
    ended_by_name: a.endedBy ? nameIn(names, a.endedBy) : null,
  }));
}

async function endActive(tx: Tx, learnerId: string, actorId: string, reason: string | null) {
  const [ended] = await tx
    .update(coachAssignment)
    .set({ status: "ENDED", endedAt: new Date(), endedBy: actorId, endReason: reason })
    .where(and(eq(coachAssignment.learnerId, learnerId), eq(coachAssignment.status, "ACTIVE")))
    .returning();
  return ended ?? null;
}

export async function assignCoach(call: LiveCall, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(
    z.object({
      learnerId: z.string().min(1),
      coachId: z.string().min(1, "Sélectionnez un coach."),
      reason: z.string().trim().max(500).optional().nullable(),
      reassignOpenRequests: z.boolean().default(false),
    }),
    input,
  );
  return db.transaction(async (tx) => {
    // Verrou sur l'apprenant : sérialise les affectations concurrentes du même apprenant.
    const learner = await getUser(tx, data.learnerId, { forUpdate: true });
    const coachUser = await getUser(tx, data.coachId);
    if (learner.role !== "LEARNER") throw businessRule("Seul un apprenant peut recevoir une affectation.");
    if (coachUser.role !== "COACH") throw businessRule("L’utilisateur sélectionné n’est pas un coach.");
    if (coachUser.status !== "ACTIVE") throw businessRule("Ce coach n’est pas actif : il ne peut pas recevoir de nouvelle affectation.");
    const [current] = await tx
      .select()
      .from(coachAssignment)
      .where(and(eq(coachAssignment.learnerId, learner.id), eq(coachAssignment.status, "ACTIVE")));
    if (current?.coachId === coachUser.id) throw businessRule("Ce coach est déjà le coach principal de l’apprenant.");
    const reason = data.reason?.trim() || null;
    if (current && (!reason || reason.length < 3)) {
      throw businessRule("Un motif est obligatoire pour modifier une affectation existante.");
    }

    const previous = await endActive(tx, learner.id, a.user.id, reason);
    const id = newId("asg");
    await tx.insert(coachAssignment).values({
      id,
      learnerId: learner.id,
      coachId: coachUser.id,
      assignedBy: a.user.id,
      startedAt: new Date(),
      status: "ACTIVE",
      reason,
    });
    await audit(tx, {
      actor_id: a.user.id,
      action: previous ? "ASSIGNMENT_CHANGED" : "ASSIGNMENT_CREATED",
      entity_type: "coach_assignment",
      entity_id: id,
      reason,
      metadata: { learner_id: learner.id, old_coach_id: previous?.coachId ?? null, new_coach_id: coachUser.id },
    });

    let moved = 0;
    if (data.reassignOpenRequests) {
      const toMove = await tx
        .select()
        .from(coachingRequest)
        .where(
          and(
            eq(coachingRequest.learnerId, learner.id),
            inArray(coachingRequest.status, OPEN_STATUSES),
            sql`${coachingRequest.coachId} is distinct from ${coachUser.id}`,
          ),
        )
        .for("update");
      const now = new Date();
      for (const req of toMove) {
        await reassignRequestInTx(tx, req, coachUser.id, a.user.id, reason ?? "Changement du coach principal de l’apprenant", now);
        moved++;
      }
    }

    await notify(tx, {
      recipients: [coachUser],
      type: "REQUEST_ASSIGNED",
      title: "Nouvel apprenant affecté",
      summary: `${learner.name} vous a été affecté(e) comme apprenant.`,
      eventKey: `ASSIGNMENT:${id}`,
    });
    await notify(tx, {
      recipients: [learner],
      type: "REASSIGNMENT",
      title: previous ? "Votre coach a changé" : "Un coach vous a été affecté",
      summary: `${coachUser.name} est désormais votre coach.`,
      eventKey: `ASSIGNMENT:${id}`,
    });
    return { assignmentId: id, movedRequests: moved };
  });
}

export async function endAssignment(call: LiveCall, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ learnerId: z.string().min(1), reason: z.string().trim().min(3, "Le motif est obligatoire.").max(500) }), input);
  await db.transaction(async (tx) => {
    await getUser(tx, data.learnerId, { forUpdate: true });
    const ended = await endActive(tx, data.learnerId, a.user.id, data.reason);
    if (!ended) throw businessRule("Cet apprenant n’a pas d’affectation active.");
    await audit(tx, {
      actor_id: a.user.id,
      action: "ASSIGNMENT_ENDED",
      entity_type: "coach_assignment",
      entity_id: ended.id,
      reason: data.reason,
      metadata: { learner_id: data.learnerId, coach_id: ended.coachId },
    });
  });
}
