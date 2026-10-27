/** Requêtes et écritures élémentaires réutilisées par la façade (accès aux « tables »). */
import { notFound } from "@/modules/core/errors";
import type {
  AuditLog,
  CoachAssignment,
  CoachingEntitlement,
  CoachingRequest,
  Database,
  RequestCycle,
  RequestStatus,
  Role,
  ServicePolicy,
  User,
} from "@/modules/core/types";
import { newId } from "../crypto";

export function getUser(db: Database, id: string): User {
  const u = db.users.find((x) => x.id === id);
  if (!u) throw notFound("Utilisateur introuvable.");
  return u;
}

export function findUser(db: Database, id: string | null | undefined): User | undefined {
  return id ? db.users.find((x) => x.id === id) : undefined;
}

export function userName(db: Database, id: string | null | undefined): string {
  if (!id) return "Système";
  return findUser(db, id)?.full_name ?? "Utilisateur inconnu";
}

export function usersByRole(db: Database, role: Role): User[] {
  return db.users.filter((u) => u.role === role);
}

export function activeAssignment(db: Database, learnerId: string): CoachAssignment | undefined {
  return db.coach_assignments.find((a) => a.learner_id === learnerId && a.status === "ACTIVE");
}

/** Droit courant (non remplacé) d'un apprenant. */
export function currentEntitlement(db: Database, learnerId: string): CoachingEntitlement | undefined {
  return db.coaching_entitlements.find((e) => e.learner_id === learnerId && e.superseded_at === null);
}

export function getRequest(db: Database, id: string): CoachingRequest {
  const r = db.coaching_requests.find((x) => x.id === id);
  if (!r) throw notFound("Demande introuvable.");
  return r;
}

export function currentCycle(db: Database, req: CoachingRequest): RequestCycle | undefined {
  return db.coaching_request_cycles.find((c) => c.request_id === req.id && c.cycle_number === req.current_cycle_number);
}

/** Politique applicable à une date (la plus récente dont `effective_from` ≤ date). */
export function policyAt(db: Database, at: Date): ServicePolicy {
  const sorted = [...db.service_policies].sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  const p = sorted.find((x) => new Date(x.effective_from).getTime() <= at.getTime()) ?? sorted[sorted.length - 1];
  if (!p) throw new Error("Aucune politique de service configurée.");
  return p;
}

export function policyById(db: Database, id: string): ServicePolicy {
  const p = db.service_policies.find((x) => x.id === id);
  if (!p) throw new Error("Politique de service introuvable.");
  return p;
}

export function nextSequence(db: Database, name: string): number {
  const n = (db.meta.sequences[name] ?? 0) + 1;
  db.meta.sequences[name] = n;
  return n;
}

export function nextRequestReference(db: Database, now: Date): string {
  const year = now.getUTCFullYear();
  const n = nextSequence(db, `request_ref_${year}`);
  return `COA-${year}-${String(n).padStart(6, "0")}`;
}

export function audit(
  db: Database,
  now: Date,
  entry: Omit<AuditLog, "id" | "created_at" | "metadata"> & { metadata?: Record<string, unknown> },
): void {
  db.audit_logs.push({ id: newId("aud"), created_at: now.toISOString(), metadata: {}, ...entry });
}

export function recordStatusChange(
  db: Database,
  now: Date,
  req: CoachingRequest,
  newStatus: RequestStatus,
  actorId: string | null,
  reason: string | null = null,
): void {
  const cycle = currentCycle(db, req);
  db.request_status_history.push({
    id: newId("rsh"),
    request_id: req.id,
    cycle_id: cycle?.id ?? null,
    old_status: req.status,
    new_status: newStatus,
    changed_by: actorId,
    reason,
    created_at: now.toISOString(),
  });
  req.status = newStatus;
  req.updated_at = now.toISOString();
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const size = Math.min(Math.max(1, Math.floor(pageSize)), 100);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Math.floor(page)), pages);
  return { items: items.slice((p - 1) * size, p * size), total, page: p, pageSize: size, pages };
}

export type Page<T> = ReturnType<typeof paginate<T>>;
