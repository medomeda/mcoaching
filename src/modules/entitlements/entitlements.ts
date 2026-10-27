/**
 * Droits au coaching et quotas (PRD §7.2, §12.3, §12.4).
 * Le solde n'est jamais un compteur modifiable : il est recalculé depuis le registre.
 */
import type {
  CoachAssignment,
  CoachingEntitlement,
  EntitlementStatus,
  QuotaLedgerEntry,
  User,
} from "../core/types";

export type EffectiveEntitlementStatus = EntitlementStatus | "NOT_STARTED" | "NONE";

export function effectiveEntitlementStatus(
  ent: CoachingEntitlement | null | undefined,
  now: Date,
): EffectiveEntitlementStatus {
  if (!ent) return "NONE";
  if (ent.status === "SUSPENDED") return "SUSPENDED";
  if (ent.status === "EXPIRED") return "EXPIRED";
  if (ent.expires_at && new Date(ent.expires_at).getTime() <= now.getTime()) return "EXPIRED";
  if (new Date(ent.starts_at).getTime() > now.getTime()) return "NOT_STARTED";
  return "ACTIVE";
}

export interface QuotaBalance {
  enabled: boolean;
  limit: number | null;
  /** Unités consommées nettes (consommations − remboursements). */
  used: number;
  /** Somme des corrections administratives (positives = unités ajoutées). */
  corrections: number;
  /** null si aucun quota. */
  remaining: number | null;
}

export function quotaBalance(ent: CoachingEntitlement | null | undefined, ledger: QuotaLedgerEntry[]): QuotaBalance {
  if (!ent || !ent.quota_enabled) return { enabled: false, limit: null, used: 0, corrections: 0, remaining: null };
  const entries = ledger.filter((e) => e.entitlement_id === ent.id);
  let used = 0;
  let corrections = 0;
  for (const e of entries) {
    if (e.entry_type === "CONSUME" || e.entry_type === "REFUND") used -= e.quantity;
    else corrections += e.quantity;
  }
  const limit = ent.quota_limit ?? 0;
  return { enabled: true, limit, used, corrections, remaining: limit + corrections - used };
}

export type IneligibilityReason =
  | "ACCOUNT_INACTIVE"
  | "NO_ENTITLEMENT"
  | "ENTITLEMENT_SUSPENDED"
  | "ENTITLEMENT_EXPIRED"
  | "ENTITLEMENT_NOT_STARTED"
  | "QUOTA_EXHAUSTED"
  | "NO_COACH"
  | "COACH_UNAVAILABLE";

export const INELIGIBILITY_MESSAGES: Record<IneligibilityReason, string> = {
  ACCOUNT_INACTIVE: "Votre compte n’est pas actif.",
  NO_ENTITLEMENT: "Aucun droit au coaching ne vous a été attribué. Contactez l’administrateur.",
  ENTITLEMENT_SUSPENDED: "Votre droit au coaching est suspendu. Vos demandes en cours restent accessibles.",
  ENTITLEMENT_EXPIRED: "Votre droit au coaching a expiré. Vos demandes en cours restent accessibles.",
  ENTITLEMENT_NOT_STARTED: "Votre droit au coaching n’a pas encore commencé.",
  QUOTA_EXHAUSTED: "Vous avez utilisé toutes les demandes prévues par votre quota.",
  NO_COACH: "Aucun coach ne vous est encore affecté. L’administrateur doit procéder à l’affectation.",
  COACH_UNAVAILABLE: "Votre coach n’est pas disponible actuellement. L’administrateur a été informé.",
};

export interface EligibilityInput {
  learner: User;
  entitlement: CoachingEntitlement | null | undefined;
  ledger: QuotaLedgerEntry[];
  assignment: CoachAssignment | null | undefined;
  coach: User | null | undefined;
  now: Date;
}

export interface Eligibility {
  ok: boolean;
  reasons: IneligibilityReason[];
  entitlementStatus: EffectiveEntitlementStatus;
  balance: QuotaBalance;
}

/** Contrôle unique utilisé à l'affichage ET dans la transaction de soumission. */
export function checkSubmissionEligibility(input: EligibilityInput): Eligibility {
  const reasons: IneligibilityReason[] = [];
  const status = effectiveEntitlementStatus(input.entitlement, input.now);
  const balance = quotaBalance(input.entitlement, input.ledger);

  if (input.learner.status !== "ACTIVE") reasons.push("ACCOUNT_INACTIVE");
  if (status === "NONE") reasons.push("NO_ENTITLEMENT");
  if (status === "SUSPENDED") reasons.push("ENTITLEMENT_SUSPENDED");
  if (status === "EXPIRED") reasons.push("ENTITLEMENT_EXPIRED");
  if (status === "NOT_STARTED") reasons.push("ENTITLEMENT_NOT_STARTED");
  if (balance.enabled && (balance.remaining ?? 0) <= 0) reasons.push("QUOTA_EXHAUSTED");
  if (!input.assignment || input.assignment.status !== "ACTIVE") reasons.push("NO_COACH");
  else if (!input.coach || input.coach.status !== "ACTIVE") reasons.push("COACH_UNAVAILABLE");

  return { ok: reasons.length === 0, reasons, entitlementStatus: status, balance };
}

export const ENTITLEMENT_STATUS_LABELS: Record<EffectiveEntitlementStatus, string> = {
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  EXPIRED: "Expiré",
  NOT_STARTED: "Pas encore commencé",
  NONE: "Aucun droit",
};
