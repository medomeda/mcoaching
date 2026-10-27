/**
 * Droits au coaching et registre de quota (PRD §7.2, §9.5).
 * Le registre est append-only ; toute correction exige un motif et un auteur.
 */
import { z } from "zod";
import { businessRule, notFound } from "@/modules/core/errors";
import type { CoachingEntitlement, Database, QuotaLedgerEntry } from "@/modules/core/types";
import { effectiveEntitlementStatus, quotaBalance } from "@/modules/entitlements/entitlements";
import { newId } from "../crypto";
import { audit, currentEntitlement, getRequest, getUser, paginate, userName } from "../db/helpers";
import { notify } from "../notify";
import { authenticate, parse, reauth, store, zReason, type Call } from "./context";

function entitlementView(db: Database, ent: CoachingEntitlement | undefined, now: Date) {
  if (!ent) return null;
  return {
    ...ent,
    effective_status: effectiveEntitlementStatus(ent, now),
    balance: quotaBalance(ent, db.coaching_quota_ledger),
    created_by_name: userName(db, ent.created_by),
    updated_by_name: userName(db, ent.updated_by),
  };
}

function ledgerView(db: Database, entries: QuotaLedgerEntry[]) {
  return entries
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((e) => ({
      ...e,
      created_by_name: userName(db, e.created_by),
      request_reference: e.request_id ? (db.coaching_requests.find((r) => r.id === e.request_id)?.reference ?? null) : null,
    }));
}

export async function listEntitlements(call: Call, input: unknown) {
  await authenticate(call, "ADMIN");
  const f = parse(
    z.object({
      q: z.string().trim().max(100).optional(),
      status: z.enum(["ACTIVE", "SUSPENDED", "EXPIRED", "NOT_STARTED", "NONE"]).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }),
    input ?? {},
  );
  const db = store().snapshot();
  const now = store().now(db);
  const q = f.q?.toLowerCase();
  const rows = db.users
    .filter((u) => u.role === "LEARNER")
    .filter((u) => !q || u.full_name.toLowerCase().includes(q) || u.email.includes(q))
    .map((l) => ({ learner: { id: l.id, full_name: l.full_name, email: l.email, status: l.status }, entitlement: entitlementView(db, currentEntitlement(db, l.id), now) }))
    .filter((r) => !f.status || (r.entitlement?.effective_status ?? "NONE") === f.status)
    .sort((x, y) => x.learner.full_name.localeCompare(y.learner.full_name, "fr"));
  return paginate(rows, f.page, f.pageSize);
}

export async function learnerEntitlementDetail(call: Call, learnerId: string) {
  await authenticate(call, "ADMIN");
  const db = store().snapshot();
  const now = store().now(db);
  const learner = getUser(db, learnerId);
  if (learner.role !== "LEARNER") throw notFound("Apprenant introuvable.");
  const all = db.coaching_entitlements.filter((e) => e.learner_id === learnerId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    learner: { id: learner.id, full_name: learner.full_name, email: learner.email },
    current: entitlementView(db, currentEntitlement(db, learnerId), now),
    history: all.map((e) => entitlementView(db, e, now)!),
    ledger: ledgerView(db, db.coaching_quota_ledger.filter((e) => e.learner_id === learnerId)),
    refundable_requests: db.coaching_requests
      .filter((r) => r.learner_id === learnerId)
      .filter((r) => {
        const entries = db.coaching_quota_ledger.filter((e) => e.request_id === r.id);
        const consumed = -entries.filter((e) => e.entry_type === "CONSUME" || e.entry_type === "REFUND").reduce((s, e) => s + e.quantity, 0);
        return consumed > 0;
      })
      .map((r) => ({ id: r.id, reference: r.reference, subject: r.subject, status: r.status })),
  };
}

const zDate = z.string().datetime({ message: "Date invalide." });

const zQuota = z
  .object({ quota_enabled: z.boolean(), quota_limit: z.number().int().min(1, "Au moins 1 demande.").max(1000).nullable().optional() })
  .refine((x) => !x.quota_enabled || (x.quota_limit ?? 0) >= 1, { message: "Indiquez le nombre de demandes autorisées.", path: ["quota_limit"] });

export async function grantEntitlement(call: Call, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(
    z
      .object({
        learnerId: z.string().min(1),
        starts_at: zDate,
        expires_at: zDate.nullable().optional(),
        quota_enabled: z.boolean(),
        quota_limit: z.number().int().min(1).max(1000).nullable().optional(),
        reason: z.string().trim().max(500).optional().nullable(),
      })
      .refine((x) => !x.expires_at || x.expires_at > x.starts_at, { message: "La date de fin doit suivre la date de début.", path: ["expires_at"] })
      .refine((x) => !x.quota_enabled || (x.quota_limit ?? 0) >= 1, { message: "Indiquez le nombre de demandes autorisées.", path: ["quota_limit"] }),
    input,
  );
  return store().transaction((db, now) => {
    reauth(db, a);
    const learner = getUser(db, data.learnerId);
    if (learner.role !== "LEARNER") throw businessRule("Un droit au coaching ne peut être attribué qu’à un apprenant.");
    const iso = now.toISOString();
    const previous = currentEntitlement(db, learner.id);
    if (previous) {
      previous.superseded_at = iso;
      previous.updated_at = iso;
      previous.updated_by = a.user.id;
    }
    const ent: CoachingEntitlement = {
      id: newId("ent"),
      learner_id: learner.id,
      status: "ACTIVE",
      starts_at: data.starts_at,
      expires_at: data.expires_at ?? null,
      quota_enabled: data.quota_enabled,
      quota_limit: data.quota_enabled ? (data.quota_limit ?? null) : null,
      superseded_at: null,
      created_by: a.user.id,
      updated_by: a.user.id,
      created_at: iso,
      updated_at: iso,
    };
    db.coaching_entitlements.push(ent);
    audit(db, now, {
      actor_id: a.user.id,
      action: "ENTITLEMENT_GRANTED",
      entity_type: "coaching_entitlement",
      entity_id: ent.id,
      reason: data.reason || null,
      metadata: { learner_id: learner.id, replaces: previous?.id ?? null, quota_enabled: ent.quota_enabled, quota_limit: ent.quota_limit, starts_at: ent.starts_at, expires_at: ent.expires_at },
    });
    notify(db, now, {
      recipients: [learner],
      type: "ACCOUNT",
      title: "Votre droit au coaching a été mis à jour",
      summary: "Un droit au coaching vous a été attribué. Consultez votre espace pour en voir le détail.",
      eventKey: `ENTITLEMENT_GRANTED:${ent.id}`,
    });
    return ent;
  });
}

function getEntitlement(db: Database, id: string) {
  const e = db.coaching_entitlements.find((x) => x.id === id);
  if (!e) throw notFound("Droit introuvable.");
  if (e.superseded_at) throw businessRule("Ce droit a été remplacé : modifiez le droit en vigueur.");
  return e;
}

/** Prolongation / modification de la période ou du quota (motif obligatoire). */
export async function updateEntitlement(call: Call, entitlementId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ expires_at: zDate.nullable(), reason: zReason() }).and(zQuota), input);
  return store().transaction((db, now) => {
    reauth(db, a);
    const ent = getEntitlement(db, entitlementId);
    if (data.expires_at && data.expires_at <= ent.starts_at) throw businessRule("La date de fin doit suivre la date de début.");
    const before = { expires_at: ent.expires_at, quota_enabled: ent.quota_enabled, quota_limit: ent.quota_limit };
    if (data.quota_enabled) {
      const bal = quotaBalance({ ...ent, quota_enabled: true, quota_limit: data.quota_limit ?? 0 }, db.coaching_quota_ledger);
      if ((bal.remaining ?? 0) < 0) {
        throw businessRule(`Le quota ne peut pas être inférieur aux ${bal.used} demande(s) déjà consommée(s) (corrections incluses).`);
      }
    }
    ent.expires_at = data.expires_at;
    ent.quota_enabled = data.quota_enabled;
    ent.quota_limit = data.quota_enabled ? (data.quota_limit ?? null) : null;
    // Une prolongation au-delà de la date courante réactive un droit expiré par échéance.
    if (ent.status === "EXPIRED" && (!ent.expires_at || ent.expires_at > now.toISOString())) ent.status = "ACTIVE";
    ent.updated_at = now.toISOString();
    ent.updated_by = a.user.id;
    audit(db, now, { actor_id: a.user.id, action: "ENTITLEMENT_UPDATED", entity_type: "coaching_entitlement", entity_id: ent.id, reason: data.reason, metadata: { before, after: { expires_at: ent.expires_at, quota_enabled: ent.quota_enabled, quota_limit: ent.quota_limit } } });
    return ent;
  });
}

export async function setEntitlementStatus(call: Call, entitlementId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ action: z.enum(["SUSPEND", "REACTIVATE", "REVOKE"]), reason: zReason() }), input);
  return store().transaction((db, now) => {
    reauth(db, a);
    const ent = getEntitlement(db, entitlementId);
    const old = ent.status;
    if (data.action === "SUSPEND") {
      if (ent.status !== "ACTIVE") throw businessRule("Seul un droit actif peut être suspendu.");
      ent.status = "SUSPENDED";
    } else if (data.action === "REACTIVATE") {
      if (ent.status !== "SUSPENDED") throw businessRule("Seul un droit suspendu peut être réactivé.");
      ent.status = "ACTIVE";
    } else {
      if (ent.status === "EXPIRED") throw businessRule("Ce droit est déjà retiré ou expiré.");
      ent.status = "EXPIRED";
    }
    ent.updated_at = now.toISOString();
    ent.updated_by = a.user.id;
    audit(db, now, {
      actor_id: a.user.id,
      action: { SUSPEND: "ENTITLEMENT_SUSPENDED", REACTIVATE: "ENTITLEMENT_REACTIVATED", REVOKE: "ENTITLEMENT_REVOKED" }[data.action],
      entity_type: "coaching_entitlement",
      entity_id: ent.id,
      reason: data.reason,
      metadata: { from: old, to: ent.status },
    });
    const learner = getUser(db, ent.learner_id);
    notify(db, now, {
      recipients: [learner],
      type: "ACCOUNT",
      title: data.action === "REACTIVATE" ? "Votre droit au coaching est réactivé" : "Votre droit au coaching a changé",
      summary:
        data.action === "REACTIVATE"
          ? "Vous pouvez de nouveau soumettre des demandes de coaching."
          : "Vous ne pouvez plus soumettre de nouvelle demande. Vos demandes en cours restent accessibles.",
      eventKey: `ENTITLEMENT_STATUS:${ent.id}:${now.toISOString()}`,
    });
    return ent;
  });
}

export async function correctQuota(call: Call, entitlementId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(
    z.object({
      quantity: z.number().int().min(-100).max(100).refine((n) => n !== 0, "La correction ne peut pas être nulle."),
      reason: zReason(),
    }),
    input,
  );
  return store().transaction((db, now) => {
    reauth(db, a);
    const ent = getEntitlement(db, entitlementId);
    if (!ent.quota_enabled) throw businessRule("Aucun quota n’est activé pour ce droit.");
    const bal = quotaBalance(ent, db.coaching_quota_ledger);
    if ((bal.remaining ?? 0) + data.quantity < 0) throw businessRule("La correction rendrait le solde négatif.");
    const entry: QuotaLedgerEntry = {
      id: newId("qle"),
      learner_id: ent.learner_id,
      entitlement_id: ent.id,
      request_id: null,
      entry_type: "CORRECTION",
      quantity: data.quantity,
      reason: data.reason,
      created_by: a.user.id,
      created_at: now.toISOString(),
      idempotency_key: null,
    };
    db.coaching_quota_ledger.push(entry);
    audit(db, now, { actor_id: a.user.id, action: "QUOTA_CORRECTED", entity_type: "coaching_entitlement", entity_id: ent.id, reason: data.reason, metadata: { quantity: data.quantity, ledger_entry_id: entry.id } });
    return entry;
  });
}

/** Remboursement exceptionnel d'une unité consommée par une demande (jamais automatique). */
export async function refundRequestQuota(call: Call, requestId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ reason: zReason() }), input);
  return store().transaction((db, now) => {
    reauth(db, a);
    const req = getRequest(db, requestId);
    const entries = db.coaching_quota_ledger.filter((e) => e.request_id === req.id);
    const consume = entries.find((e) => e.entry_type === "CONSUME");
    if (!consume) throw businessRule("Cette demande n’a consommé aucune unité de quota.");
    const net = -entries.filter((e) => e.entry_type !== "CORRECTION").reduce((s, e) => s + e.quantity, 0);
    if (net <= 0) throw businessRule("L’unité consommée par cette demande a déjà été remboursée.");
    const entry: QuotaLedgerEntry = {
      id: newId("qle"),
      learner_id: req.learner_id,
      entitlement_id: consume.entitlement_id,
      request_id: req.id,
      entry_type: "REFUND",
      quantity: 1,
      reason: data.reason,
      created_by: a.user.id,
      created_at: now.toISOString(),
      idempotency_key: `refund:${req.id}`,
    };
    db.coaching_quota_ledger.push(entry);
    audit(db, now, { actor_id: a.user.id, action: "QUOTA_REFUNDED", entity_type: "coaching_request", entity_id: req.id, reason: data.reason, metadata: { ledger_entry_id: entry.id } });
    return entry;
  });
}

export async function myEntitlement(call: Call) {
  const a = await authenticate(call, "LEARNER");
  const db = store().snapshot();
  const now = store().now(db);
  const ent = currentEntitlement(db, a.user.id);
  return {
    entitlement: ent
      ? {
          status: ent.status,
          effective_status: effectiveEntitlementStatus(ent, now),
          starts_at: ent.starts_at,
          expires_at: ent.expires_at,
          quota_enabled: ent.quota_enabled,
          quota_limit: ent.quota_limit,
          balance: quotaBalance(ent, db.coaching_quota_ledger),
        }
      : null,
    // L'apprenant voit les mouvements de son droit courant, sans le nom des administrateurs.
    ledger: ent
      ? ledgerView(db, db.coaching_quota_ledger.filter((e) => e.entitlement_id === ent.id)).map((e) => ({
          id: e.id,
          entry_type: e.entry_type,
          quantity: e.quantity,
          reason: e.entry_type === "CONSUME" ? null : e.reason,
          created_at: e.created_at,
          request_reference: e.request_reference,
        }))
      : [],
  };
}
