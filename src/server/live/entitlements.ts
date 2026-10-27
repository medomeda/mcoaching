/**
 * Droits au coaching et registre de quota (PRD §7.2, §9.5) sur PostgreSQL.
 * Le registre est append-only ; toute correction exige un motif et un auteur.
 * Les opérations sur un droit verrouillent sa ligne : le solde est recalculé sous verrou.
 */
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { businessRule, notFound } from "@/modules/core/errors";
import { parse, zReason } from "@/modules/core/validation";
import { effectiveEntitlementStatus, quotaBalance } from "@/modules/entitlements/entitlements";
import { newId } from "../crypto";
import { db } from "../pg/client";
import { coachingEntitlement, coachingQuotaLedger, coachingRequest, user } from "../pg/schema";
import { authenticate, type LiveCall } from "./context";
import { audit, getUser, nameIn, namesOf, notify, pageOf, userSearch, type Tx } from "./helpers";
import { toEntitlement, toLedgerEntry } from "./mappers";

type EntRow = typeof coachingEntitlement.$inferSelect;
type LedgerRow = typeof coachingQuotaLedger.$inferSelect;

async function ledgerFor(tx: Tx, entitlementIds: string[]) {
  if (entitlementIds.length === 0) return [];
  return (await tx.select().from(coachingQuotaLedger).where(inArray(coachingQuotaLedger.entitlementId, entitlementIds))).map(toLedgerEntry);
}

/** Vues enrichies (statut effectif, solde, auteurs), calculées par lot. */
async function entitlementViews(tx: Tx, rows: EntRow[], now: Date) {
  const ledger = await ledgerFor(tx, rows.map((e) => e.id));
  const names = await namesOf(tx, rows.flatMap((e) => [e.createdBy, e.updatedBy]));
  return rows.map((row) => {
    const ent = toEntitlement(row);
    return {
      ...ent,
      effective_status: effectiveEntitlementStatus(ent, now),
      balance: quotaBalance(ent, ledger),
      created_by_name: nameIn(names, ent.created_by),
      updated_by_name: nameIn(names, ent.updated_by),
    };
  });
}

async function ledgerView(tx: Tx, entries: LedgerRow[]) {
  const sorted = [...entries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const names = await namesOf(tx, sorted.map((e) => e.createdBy));
  const requestIds = [...new Set(sorted.map((e) => e.requestId).filter((x): x is string => !!x))];
  const refs = requestIds.length
    ? new Map(
        (await tx.select({ id: coachingRequest.id, reference: coachingRequest.reference }).from(coachingRequest).where(inArray(coachingRequest.id, requestIds))).map(
          (r) => [r.id, r.reference],
        ),
      )
    : new Map<string, string | null>();
  return sorted.map((e) => ({
    ...toLedgerEntry(e),
    created_by_name: nameIn(names, e.createdBy),
    request_reference: e.requestId ? (refs.get(e.requestId) ?? null) : null,
  }));
}

/** Droit en vigueur (non remplacé) d'un apprenant, par identifiant ou par jointure sur `user.id`. */
const currentOf = (learner: string | typeof user.id) =>
  and(eq(coachingEntitlement.learnerId, learner), isNull(coachingEntitlement.supersededAt));

/** Traduction SQL de `effectiveEntitlementStatus` (même ordre de priorité). */
function effectiveStatusFilter(status: "ACTIVE" | "SUSPENDED" | "EXPIRED" | "NOT_STARTED" | "NONE", now: Date): SQL {
  const e = coachingEntitlement;
  const notExpiredByDate = or(isNull(e.expiresAt), gt(e.expiresAt, now))!;
  switch (status) {
    case "NONE":
      return isNull(e.id);
    case "SUSPENDED":
      return eq(e.status, "SUSPENDED");
    case "EXPIRED":
      return or(eq(e.status, "EXPIRED"), and(eq(e.status, "ACTIVE"), lte(e.expiresAt, now)))!;
    case "NOT_STARTED":
      return and(eq(e.status, "ACTIVE"), notExpiredByDate, gt(e.startsAt, now))!;
    case "ACTIVE":
      return and(eq(e.status, "ACTIVE"), notExpiredByDate, lte(e.startsAt, now))!;
  }
}

export async function listEntitlements(call: LiveCall, input: unknown) {
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
  const now = new Date();
  const filters: SQL[] = [eq(user.role, "LEARNER")];
  const search = userSearch(f.q);
  if (search) filters.push(search);
  if (f.status) filters.push(effectiveStatusFilter(f.status, now));
  const where = and(...filters);
  const join = currentOf(user.id);

  const total = (await db.select({ n: count() }).from(user).leftJoin(coachingEntitlement, join).where(where))[0]?.n ?? 0;
  const { page, pages } = pageOf(total, f.page, f.pageSize);
  const rows = await db
    .select({ learner: { id: user.id, full_name: user.name, email: user.email, status: user.status }, ent: coachingEntitlement })
    .from(user)
    .leftJoin(coachingEntitlement, join)
    .where(where)
    .orderBy(asc(sql`lower(${user.name})`), asc(user.id))
    .limit(f.pageSize)
    .offset((page - 1) * f.pageSize);

  const views = await entitlementViews(db, rows.flatMap((r) => (r.ent ? [r.ent] : [])), now);
  const viewOf = new Map(views.map((v) => [v.id, v]));
  return {
    items: rows.map((r) => ({ learner: r.learner, entitlement: r.ent ? viewOf.get(r.ent.id)! : null })),
    total,
    page,
    pageSize: f.pageSize,
    pages,
  };
}

export async function learnerEntitlementDetail(call: LiveCall, learnerId: string) {
  await authenticate(call, "ADMIN");
  const now = new Date();
  const learner = await getUser(db, String(learnerId));
  if (learner.role !== "LEARNER") throw notFound("Apprenant introuvable.");
  const all = await db.select().from(coachingEntitlement).where(eq(coachingEntitlement.learnerId, learner.id)).orderBy(desc(coachingEntitlement.createdAt));
  const history = await entitlementViews(db, all, now);
  const ledger = await db.select().from(coachingQuotaLedger).where(eq(coachingQuotaLedger.learnerId, learner.id));

  // Demandes ayant encore une unité consommée nette (CONSUME + REFUND < 0).
  const netByRequest = new Map<string, number>();
  for (const e of ledger) {
    if (!e.requestId || e.entryType === "CORRECTION") continue;
    netByRequest.set(e.requestId, (netByRequest.get(e.requestId) ?? 0) - e.quantity);
  }
  const refundableIds = [...netByRequest].filter(([, consumed]) => consumed > 0).map(([id]) => id);
  const refundable = refundableIds.length
    ? await db
        .select({ id: coachingRequest.id, reference: coachingRequest.reference, subject: coachingRequest.subject, status: coachingRequest.status })
        .from(coachingRequest)
        .where(inArray(coachingRequest.id, refundableIds))
    : [];

  return {
    learner: { id: learner.id, full_name: learner.name, email: learner.email },
    current: history.find((v) => v.superseded_at === null) ?? null,
    history,
    ledger: await ledgerView(db, ledger),
    refundable_requests: refundable,
  };
}

const zDate = z.string().datetime({ message: "Date invalide." });

const zQuota = z
  .object({ quota_enabled: z.boolean(), quota_limit: z.number().int().min(1, "Au moins 1 demande.").max(1000).nullable().optional() })
  .refine((x) => !x.quota_enabled || (x.quota_limit ?? 0) >= 1, { message: "Indiquez le nombre de demandes autorisées.", path: ["quota_limit"] });

export async function grantEntitlement(call: LiveCall, input: unknown) {
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
      .refine((x) => !x.expires_at || new Date(x.expires_at) > new Date(x.starts_at), { message: "La date de fin doit suivre la date de début.", path: ["expires_at"] })
      .refine((x) => !x.quota_enabled || (x.quota_limit ?? 0) >= 1, { message: "Indiquez le nombre de demandes autorisées.", path: ["quota_limit"] }),
    input,
  );
  return db.transaction(async (tx) => {
    const learner = await getUser(tx, data.learnerId, { forUpdate: true });
    if (learner.role !== "LEARNER") throw businessRule("Un droit au coaching ne peut être attribué qu’à un apprenant.");
    const now = new Date();
    const [previous] = await tx
      .update(coachingEntitlement)
      .set({ supersededAt: now, updatedAt: now, updatedBy: a.user.id })
      .where(currentOf(learner.id))
      .returning();
    const [ent] = await tx
      .insert(coachingEntitlement)
      .values({
        id: newId("ent"),
        learnerId: learner.id,
        status: "ACTIVE",
        startsAt: new Date(data.starts_at),
        expiresAt: data.expires_at ? new Date(data.expires_at) : null,
        quotaEnabled: data.quota_enabled,
        quotaLimit: data.quota_enabled ? (data.quota_limit ?? null) : null,
        createdBy: a.user.id,
        updatedBy: a.user.id,
      })
      .returning();
    const view = toEntitlement(ent!);
    await audit(tx, {
      actor_id: a.user.id,
      action: "ENTITLEMENT_GRANTED",
      entity_type: "coaching_entitlement",
      entity_id: view.id,
      reason: data.reason || null,
      metadata: { learner_id: learner.id, replaces: previous?.id ?? null, quota_enabled: view.quota_enabled, quota_limit: view.quota_limit, starts_at: view.starts_at, expires_at: view.expires_at },
    });
    await notify(tx, {
      recipients: [learner],
      type: "ACCOUNT",
      title: "Votre droit au coaching a été mis à jour",
      summary: "Un droit au coaching vous a été attribué. Consultez votre espace pour en voir le détail.",
      eventKey: `ENTITLEMENT_GRANTED:${view.id}`,
    });
    return view;
  });
}

/** Droit en vigueur, verrouillé pour la durée de la transaction. */
async function lockEntitlement(tx: Tx, id: string) {
  const [e] = await tx.select().from(coachingEntitlement).where(eq(coachingEntitlement.id, String(id))).for("update");
  if (!e) throw notFound("Droit introuvable.");
  if (e.supersededAt) throw businessRule("Ce droit a été remplacé : modifiez le droit en vigueur.");
  return e;
}

/** Prolongation / modification de la période ou du quota (motif obligatoire). */
export async function updateEntitlement(call: LiveCall, entitlementId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ expires_at: zDate.nullable(), reason: zReason() }).and(zQuota), input);
  return db.transaction(async (tx) => {
    const row = await lockEntitlement(tx, entitlementId);
    const ent = toEntitlement(row);
    const now = new Date();
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
    if (expiresAt && expiresAt <= row.startsAt) throw businessRule("La date de fin doit suivre la date de début.");
    const before = { expires_at: ent.expires_at, quota_enabled: ent.quota_enabled, quota_limit: ent.quota_limit };
    if (data.quota_enabled) {
      const bal = quotaBalance({ ...ent, quota_enabled: true, quota_limit: data.quota_limit ?? 0 }, await ledgerFor(tx, [ent.id]));
      if ((bal.remaining ?? 0) < 0) {
        throw businessRule(`Le quota ne peut pas être inférieur aux ${bal.used} demande(s) déjà consommée(s) (corrections incluses).`);
      }
    }
    // Une prolongation au-delà de la date courante réactive un droit expiré par échéance.
    const status = row.status === "EXPIRED" && (!expiresAt || expiresAt > now) ? "ACTIVE" : row.status;
    const [updated] = await tx
      .update(coachingEntitlement)
      .set({
        expiresAt,
        quotaEnabled: data.quota_enabled,
        quotaLimit: data.quota_enabled ? (data.quota_limit ?? null) : null,
        status,
        updatedAt: now,
        updatedBy: a.user.id,
      })
      .where(eq(coachingEntitlement.id, row.id))
      .returning();
    const after = toEntitlement(updated!);
    await audit(tx, {
      actor_id: a.user.id,
      action: "ENTITLEMENT_UPDATED",
      entity_type: "coaching_entitlement",
      entity_id: row.id,
      reason: data.reason,
      metadata: { before, after: { expires_at: after.expires_at, quota_enabled: after.quota_enabled, quota_limit: after.quota_limit } },
    });
    return after;
  });
}

export async function setEntitlementStatus(call: LiveCall, entitlementId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ action: z.enum(["SUSPEND", "REACTIVATE", "REVOKE"]), reason: zReason() }), input);
  return db.transaction(async (tx) => {
    const row = await lockEntitlement(tx, entitlementId);
    let status = row.status;
    if (data.action === "SUSPEND") {
      if (row.status !== "ACTIVE") throw businessRule("Seul un droit actif peut être suspendu.");
      status = "SUSPENDED";
    } else if (data.action === "REACTIVATE") {
      if (row.status !== "SUSPENDED") throw businessRule("Seul un droit suspendu peut être réactivé.");
      status = "ACTIVE";
    } else {
      if (row.status === "EXPIRED") throw businessRule("Ce droit est déjà retiré ou expiré.");
      status = "EXPIRED";
    }
    const now = new Date();
    const [updated] = await tx
      .update(coachingEntitlement)
      .set({ status, updatedAt: now, updatedBy: a.user.id })
      .where(eq(coachingEntitlement.id, row.id))
      .returning();
    await audit(tx, {
      actor_id: a.user.id,
      action: { SUSPEND: "ENTITLEMENT_SUSPENDED", REACTIVATE: "ENTITLEMENT_REACTIVATED", REVOKE: "ENTITLEMENT_REVOKED" }[data.action],
      entity_type: "coaching_entitlement",
      entity_id: row.id,
      reason: data.reason,
      metadata: { from: row.status, to: status },
    });
    await notify(tx, {
      recipients: [await getUser(tx, row.learnerId)],
      type: "ACCOUNT",
      title: data.action === "REACTIVATE" ? "Votre droit au coaching est réactivé" : "Votre droit au coaching a changé",
      summary:
        data.action === "REACTIVATE"
          ? "Vous pouvez de nouveau soumettre des demandes de coaching."
          : "Vous ne pouvez plus soumettre de nouvelle demande. Vos demandes en cours restent accessibles.",
      eventKey: `ENTITLEMENT_STATUS:${row.id}:${now.toISOString()}`,
    });
    return toEntitlement(updated!);
  });
}

export async function correctQuota(call: LiveCall, entitlementId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(
    z.object({
      quantity: z.number().int().min(-100).max(100).refine((n) => n !== 0, "La correction ne peut pas être nulle."),
      reason: zReason(),
    }),
    input,
  );
  return db.transaction(async (tx) => {
    const row = await lockEntitlement(tx, entitlementId);
    if (!row.quotaEnabled) throw businessRule("Aucun quota n’est activé pour ce droit.");
    const bal = quotaBalance(toEntitlement(row), await ledgerFor(tx, [row.id]));
    if ((bal.remaining ?? 0) + data.quantity < 0) throw businessRule("La correction rendrait le solde négatif.");
    const [entry] = await tx
      .insert(coachingQuotaLedger)
      .values({
        id: newId("qle"),
        learnerId: row.learnerId,
        entitlementId: row.id,
        entryType: "CORRECTION",
        quantity: data.quantity,
        reason: data.reason,
        createdBy: a.user.id,
      })
      .returning();
    await audit(tx, { actor_id: a.user.id, action: "QUOTA_CORRECTED", entity_type: "coaching_entitlement", entity_id: row.id, reason: data.reason, metadata: { quantity: data.quantity, ledger_entry_id: entry!.id } });
    return toLedgerEntry(entry!);
  });
}

/** Remboursement exceptionnel d'une unité consommée par une demande (jamais automatique). */
export async function refundRequestQuota(call: LiveCall, requestId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ reason: zReason() }), input);
  return db.transaction(async (tx) => {
    const [req] = await tx.select().from(coachingRequest).where(eq(coachingRequest.id, String(requestId))).for("update");
    if (!req) throw notFound("Demande introuvable.");
    const entries = await tx.select().from(coachingQuotaLedger).where(eq(coachingQuotaLedger.requestId, req.id));
    const consume = entries.find((e) => e.entryType === "CONSUME");
    if (!consume) throw businessRule("Cette demande n’a consommé aucune unité de quota.");
    // Le verrou porte aussi sur le droit débité, comme pour toute écriture dans son registre.
    await tx.select({ id: coachingEntitlement.id }).from(coachingEntitlement).where(eq(coachingEntitlement.id, consume.entitlementId)).for("update");
    const net = -entries.filter((e) => e.entryType !== "CORRECTION").reduce((s, e) => s + e.quantity, 0);
    if (net <= 0) throw businessRule("L’unité consommée par cette demande a déjà été remboursée.");
    const [entry] = await tx
      .insert(coachingQuotaLedger)
      .values({
        id: newId("qle"),
        learnerId: req.learnerId,
        entitlementId: consume.entitlementId,
        requestId: req.id,
        entryType: "REFUND",
        quantity: 1,
        reason: data.reason,
        createdBy: a.user.id,
        idempotencyKey: `refund:${req.id}`,
      })
      .returning();
    await audit(tx, { actor_id: a.user.id, action: "QUOTA_REFUNDED", entity_type: "coaching_request", entity_id: req.id, reason: data.reason, metadata: { ledger_entry_id: entry!.id } });
    return toLedgerEntry(entry!);
  });
}

export async function myEntitlement(call: LiveCall) {
  const a = await authenticate(call, "LEARNER");
  const [row] = await db.select().from(coachingEntitlement).where(currentOf(a.user.id));
  if (!row) return { entitlement: null, ledger: [] };
  const ent = toEntitlement(row);
  const entries = await db.select().from(coachingQuotaLedger).where(eq(coachingQuotaLedger.entitlementId, row.id));
  const ledger = await ledgerView(db, entries);
  return {
    entitlement: {
      status: ent.status,
      effective_status: effectiveEntitlementStatus(ent, new Date()),
      starts_at: ent.starts_at,
      expires_at: ent.expires_at,
      quota_enabled: ent.quota_enabled,
      quota_limit: ent.quota_limit,
      balance: quotaBalance(ent, entries.map(toLedgerEntry)),
    },
    // L'apprenant voit les mouvements de son droit courant, sans le nom des administrateurs.
    ledger: ledger.map((e) => ({
      id: e.id,
      entry_type: e.entry_type,
      quantity: e.quantity,
      reason: e.entry_type === "CONSUME" ? null : e.reason,
      created_at: e.created_at,
      request_reference: e.request_reference,
    })),
  };
}
