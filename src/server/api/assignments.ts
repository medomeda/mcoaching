/**
 * Affectations coach ⇄ apprenant (PRD §7.1, §9.4). Manuelles, historisées,
 * au plus une affectation principale active par apprenant.
 */
import { z } from "zod";
import { businessRule } from "@/modules/core/errors";
import type { Database } from "@/modules/core/types";
import { isOpen } from "@/modules/requests/stateMachine";
import { newId } from "../crypto";
import { activeAssignment, audit, getUser, paginate, userName } from "../db/helpers";
import { notify } from "../notify";
import { authenticate, parse, reauth, store, type Call } from "./context";
import { reassignRequestInTx } from "./requests";

export async function assignmentOverview(call: Call, input: unknown) {
  await authenticate(call, "ADMIN");
  const f = parse(
    z.object({ q: z.string().trim().max(100).optional(), onlyUnassigned: z.boolean().optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(20) }),
    input ?? {},
  );
  const db = store().snapshot();
  const q = f.q?.toLowerCase();
  const rows = db.users
    .filter((u) => u.role === "LEARNER")
    .filter((u) => !q || u.full_name.toLowerCase().includes(q) || u.email.includes(q))
    .map((l) => {
      const a = activeAssignment(db, l.id);
      return {
        learner: { id: l.id, full_name: l.full_name, email: l.email, status: l.status },
        assignment: a ? { ...a, coach_name: userName(db, a.coach_id) } : null,
        open_requests: db.coaching_requests.filter((r) => r.learner_id === l.id && isOpen(r.status)).length,
        open_requests_other_coach: a
          ? db.coaching_requests.filter((r) => r.learner_id === l.id && isOpen(r.status) && r.coach_id !== a.coach_id).length
          : 0,
      };
    })
    .filter((r) => !f.onlyUnassigned || !r.assignment)
    .sort((x, y) => x.learner.full_name.localeCompare(y.learner.full_name, "fr"));
  return paginate(rows, f.page, f.pageSize);
}

export async function assignmentHistory(call: Call, learnerId: string) {
  await authenticate(call, "ADMIN");
  const db = store().snapshot();
  return db.coach_assignments
    .filter((a) => a.learner_id === learnerId)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .map((a) => ({
      ...a,
      coach_name: userName(db, a.coach_id),
      assigned_by_name: userName(db, a.assigned_by),
      ended_by_name: a.ended_by ? userName(db, a.ended_by) : null,
    }));
}

function endActive(db: Database, now: Date, learnerId: string, actorId: string, reason: string | null) {
  const current = activeAssignment(db, learnerId);
  if (!current) return null;
  current.status = "ENDED";
  current.ended_at = now.toISOString();
  current.ended_by = actorId;
  current.end_reason = reason;
  return current;
}

export async function assignCoach(call: Call, input: unknown) {
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
  return store().transaction((db, now) => {
    reauth(db, a);
    const learner = getUser(db, data.learnerId);
    const coach = getUser(db, data.coachId);
    if (learner.role !== "LEARNER") throw businessRule("Seul un apprenant peut recevoir une affectation.");
    if (coach.role !== "COACH") throw businessRule("L’utilisateur sélectionné n’est pas un coach.");
    if (coach.status !== "ACTIVE") throw businessRule("Ce coach n’est pas actif : il ne peut pas recevoir de nouvelle affectation.");
    const current = activeAssignment(db, learner.id);
    if (current?.coach_id === coach.id) throw businessRule("Ce coach est déjà le coach principal de l’apprenant.");
    const reason = data.reason?.trim() || null;
    if (current && (!reason || reason.length < 3)) {
      throw businessRule("Un motif est obligatoire pour modifier une affectation existante.");
    }
    const previous = endActive(db, now, learner.id, a.user.id, reason);
    const iso = now.toISOString();
    const assignment = {
      id: newId("asg"),
      learner_id: learner.id,
      coach_id: coach.id,
      assigned_by: a.user.id,
      started_at: iso,
      ended_at: null,
      ended_by: null,
      status: "ACTIVE" as const,
      reason,
      end_reason: null,
      created_at: iso,
    };
    db.coach_assignments.push(assignment);
    audit(db, now, {
      actor_id: a.user.id,
      action: previous ? "ASSIGNMENT_CHANGED" : "ASSIGNMENT_CREATED",
      entity_type: "coach_assignment",
      entity_id: assignment.id,
      reason,
      metadata: { learner_id: learner.id, old_coach_id: previous?.coach_id ?? null, new_coach_id: coach.id },
    });

    let moved = 0;
    if (data.reassignOpenRequests) {
      for (const req of db.coaching_requests.filter((r) => r.learner_id === learner.id && isOpen(r.status) && r.coach_id !== coach.id)) {
        reassignRequestInTx(db, now, req, coach.id, a.user.id, reason ?? "Changement du coach principal de l’apprenant");
        moved++;
      }
    }
    notify(db, now, {
      recipients: [coach],
      type: "REQUEST_ASSIGNED",
      title: "Nouvel apprenant affecté",
      summary: `${learner.full_name} vous a été affecté(e) comme apprenant.`,
      eventKey: `ASSIGNMENT:${assignment.id}`,
    });
    notify(db, now, {
      recipients: [learner],
      type: "REASSIGNMENT",
      title: previous ? "Votre coach a changé" : "Un coach vous a été affecté",
      summary: `${coach.full_name} est désormais votre coach.`,
      eventKey: `ASSIGNMENT:${assignment.id}`,
    });
    return { assignmentId: assignment.id, movedRequests: moved };
  });
}

export async function endAssignment(call: Call, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ learnerId: z.string().min(1), reason: z.string().trim().min(3, "Le motif est obligatoire.").max(500) }), input);
  await store().transaction((db, now) => {
    reauth(db, a);
    const ended = endActive(db, now, data.learnerId, a.user.id, data.reason);
    if (!ended) throw businessRule("Cet apprenant n’a pas d’affectation active.");
    audit(db, now, {
      actor_id: a.user.id,
      action: "ASSIGNMENT_ENDED",
      entity_type: "coach_assignment",
      entity_id: ended.id,
      reason: data.reason,
      metadata: { learner_id: data.learnerId, coach_id: ended.coach_id },
    });
  });
}
