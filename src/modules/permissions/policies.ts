/**
 * Politiques d'accès centralisées (PRD §5, §13.1). Principe du moindre privilège.
 * Ces fonctions sont appelées par la façade d'API à CHAQUE opération ;
 * l'interface ne s'en sert que pour masquer des actions, jamais pour autoriser.
 */
import { forbidden } from "../core/errors";
import type { CoachingRequest, Database, Role, User } from "../core/types";

export interface Actor {
  id: string;
  role: Role;
  status: User["status"];
}

export function assertRole(actor: Actor, ...roles: Role[]): void {
  if (!roles.includes(actor.role)) throw forbidden();
}

/** Lecture d'une demande (détail, messages, pièces jointes, historique). */
export function canViewRequest(actor: Actor, req: CoachingRequest): boolean {
  switch (actor.role) {
    case "ADMIN":
      return true;
    case "LEARNER":
      return req.learner_id === actor.id;
    case "COACH":
      // Uniquement le coach actuellement responsable (après réaffectation, l'ancien coach perd l'accès).
      return req.status !== "DRAFT" && req.coach_id === actor.id;
  }
}

/** Le coach peut agir (répondre, clôturer…) seulement s'il est responsable et actif. */
export function canActAsCoach(actor: Actor, req: CoachingRequest): boolean {
  return actor.role === "COACH" && actor.status === "ACTIVE" && req.coach_id === actor.id;
}

export function canActAsLearner(actor: Actor, req: CoachingRequest): boolean {
  return actor.role === "LEARNER" && actor.status === "ACTIVE" && req.learner_id === actor.id;
}

/** Notes internes : jamais visibles par l'apprenant (REC-16). */
export function canViewNotes(actor: Actor, req: CoachingRequest): boolean {
  if (actor.role === "ADMIN") return true;
  return actor.role === "COACH" && req.coach_id === actor.id;
}

export function canWriteNotes(actor: Actor, req: CoachingRequest): boolean {
  return canActAsCoach(actor, req);
}

/** Un coach voit les apprenants qui lui sont affectés ou dont il traite une demande. */
export function coachCanViewLearner(db: Database, coachId: string, learnerId: string): boolean {
  const assigned = db.coach_assignments.some(
    (a) => a.coach_id === coachId && a.learner_id === learnerId && a.status === "ACTIVE",
  );
  if (assigned) return true;
  return db.coaching_requests.some((r) => r.coach_id === coachId && r.learner_id === learnerId && r.status !== "DRAFT");
}

export function assertCanViewRequest(actor: Actor, req: CoachingRequest): void {
  if (!canViewRequest(actor, req)) throw forbidden("Vous n’avez pas accès à cette demande.");
}
