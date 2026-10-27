/** Gestion des utilisateurs par l'administrateur (PRD §9.2), sur PostgreSQL. Aucune suppression physique. */
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { businessRule, conflict } from "@/modules/core/errors";
import { ROLES, type Role } from "@/modules/core/types";
import { parse, zEmail, zPhone, zReason, zText } from "@/modules/core/validation";
import { effectiveEntitlementStatus } from "@/modules/entitlements/entitlements";
import { isOpen } from "@/modules/requests/stateMachine";
import { auth } from "../auth";
import { newId } from "../crypto";
import { db } from "../pg/client";
import {
  account,
  auditLog,
  coachAssignment,
  coachProfile,
  coachingEntitlement,
  coachingRequest,
  session,
  user,
} from "../pg/schema";
import { authenticate, type LiveCall } from "./context";
import { activationByEmail, generateTemporaryPassword, hashPassword, setCredentialPassword } from "./credentials";
import {
  activeAdmins,
  audit,
  getUser,
  issueActivationToken,
  nameIn,
  namesOf,
  OPEN_STATUSES,
  pageOf,
  userSearch,
  notify,
  sendActivationEmail,
  toPublicUser,
  type Tx,
  type UserRowDb,
} from "./helpers";
import { iso, toEntitlement } from "./mappers";

/** Lignes enrichies (coach, droit, apprenants affectés), calculées par lot. */
async function userRows(tx: Tx, users: UserRowDb[]) {
  const learnerIds = users.filter((u) => u.role === "LEARNER").map((u) => u.id);
  const coachIds = users.filter((u) => u.role === "COACH").map((u) => u.id);
  const now = new Date();

  const assignments = learnerIds.length
    ? await tx
        .select({ learnerId: coachAssignment.learnerId, coachId: coachAssignment.coachId, coachName: user.name })
        .from(coachAssignment)
        .innerJoin(user, eq(user.id, coachAssignment.coachId))
        .where(and(inArray(coachAssignment.learnerId, learnerIds), eq(coachAssignment.status, "ACTIVE")))
    : [];
  const entitlements = learnerIds.length
    ? await tx
        .select()
        .from(coachingEntitlement)
        .where(and(inArray(coachingEntitlement.learnerId, learnerIds), isNull(coachingEntitlement.supersededAt)))
    : [];
  const loads = coachIds.length
    ? await tx
        .select({ coachId: coachAssignment.coachId, n: count() })
        .from(coachAssignment)
        .where(and(inArray(coachAssignment.coachId, coachIds), eq(coachAssignment.status, "ACTIVE")))
        .groupBy(coachAssignment.coachId)
    : [];

  const assignmentOf = new Map(assignments.map((a) => [a.learnerId, a]));
  const entitlementOf = new Map(entitlements.map((e) => [e.learnerId, e]));
  const loadOf = new Map(loads.map((l) => [l.coachId, l.n]));

  return users.map((u) => {
    const a = assignmentOf.get(u.id);
    const ent = entitlementOf.get(u.id);
    return {
      ...toPublicUser(u),
      is_demo: u.isDemo,
      coach: u.role === "LEARNER" && a ? { id: a.coachId, full_name: a.coachName } : null,
      entitlement_status: u.role === "LEARNER" ? effectiveEntitlementStatus(ent ? toEntitlement(ent) : undefined, now) : null,
      assigned_learners: u.role === "COACH" ? (loadOf.get(u.id) ?? 0) : null,
    };
  });
}

const zListUsers = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(["PENDING_ACTIVATION", "ACTIVE", "SUSPENDED"]).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export async function listUsers(call: LiveCall, input: unknown) {
  await authenticate(call, "ADMIN");
  const f = parse(zListUsers, input ?? {});
  const filters: SQL[] = [];
  if (f.role) filters.push(eq(user.role, f.role));
  if (f.status) filters.push(eq(user.status, f.status));
  const search = userSearch(f.q);
  if (search) filters.push(search);
  const where = filters.length ? and(...filters) : undefined;
  const total = (await db.select({ total: count() }).from(user).where(where))[0]?.total ?? 0;
  const { page, pages } = pageOf(total, f.page, f.pageSize);
  const rows = await db
    .select()
    .from(user)
    .where(where)
    .orderBy(asc(sql`lower(${user.name})`), asc(user.id))
    .limit(f.pageSize)
    .offset((page - 1) * f.pageSize);
  return { items: await userRows(db, rows), total, page, pageSize: f.pageSize, pages };
}

export async function getUserDetail(call: LiveCall, userId: string) {
  await authenticate(call, "ADMIN");
  const u = await getUser(db, String(userId));
  const [row] = await userRows(db, [u]);

  const assignments = await db
    .select()
    .from(coachAssignment)
    .where(or(eq(coachAssignment.learnerId, u.id), eq(coachAssignment.coachId, u.id)))
    .orderBy(desc(coachAssignment.startedAt));
  const requests = await db
    .select({ status: coachingRequest.status })
    .from(coachingRequest)
    .where(or(eq(coachingRequest.learnerId, u.id), eq(coachingRequest.coachId, u.id)));
  const logs = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.entityId, u.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(50);

  const names = await namesOf(db, [
    ...assignments.flatMap((a) => [a.learnerId, a.coachId, a.assignedBy, a.endedBy]),
    ...logs.map((l) => l.actorId),
  ]);

  return {
    user: row!,
    assignments: assignments.map((a) => ({
      id: a.id,
      learner_id: a.learnerId,
      coach_id: a.coachId,
      assigned_by: a.assignedBy,
      started_at: a.startedAt.toISOString(),
      ended_at: iso(a.endedAt),
      ended_by: a.endedBy,
      status: a.status,
      reason: a.reason,
      end_reason: a.endReason,
      created_at: a.createdAt.toISOString(),
      learner_name: nameIn(names, a.learnerId),
      coach_name: nameIn(names, a.coachId),
      assigned_by_name: nameIn(names, a.assignedBy),
      ended_by_name: a.endedBy ? nameIn(names, a.endedBy) : null,
    })),
    stats: {
      requests_total: requests.filter((r) => r.status !== "DRAFT").length,
      requests_open: requests.filter((r) => isOpen(r.status)).length,
    },
    audit: logs.map((l) => ({
      id: l.id,
      actor_id: l.actorId,
      action: l.action,
      entity_type: l.entityType,
      entity_id: l.entityId,
      reason: l.reason,
      metadata: l.metadata,
      created_at: l.createdAt.toISOString(),
      actor_name: nameIn(names, l.actorId),
    })),
  };
}

async function assertEmailFree(tx: Tx, email: string, exceptId?: string) {
  const [taken] = await tx
    .select({ id: user.id })
    .from(user)
    .where(exceptId ? and(eq(user.email, email), ne(user.id, exceptId)) : eq(user.email, email));
  if (taken) throw conflict(exceptId ? "Cette adresse e-mail est déjà utilisée." : "Un compte existe déjà avec cette adresse e-mail.");
}

export async function createUser(call: LiveCall, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ full_name: zText(2, 120, "Le nom"), email: zEmail, role: z.enum(ROLES), phone: zPhone }), input);
  // Sans activation par e-mail : compte actif d'emblée, avec un mot de passe provisoire remis à l'administrateur.
  const byEmail = activationByEmail();
  const temporaryPassword = byEmail ? null : generateTemporaryPassword();
  const hash = temporaryPassword ? await hashPassword(temporaryPassword) : null;
  const { created, token } = await db.transaction(async (tx) => {
    await assertEmailFree(tx, data.email);
    const [created] = await tx
      .insert(user)
      .values({
        id: newId("usr"),
        name: data.full_name,
        email: data.email,
        phone: data.phone ? data.phone : null,
        role: data.role,
        status: byEmail ? "PENDING_ACTIVATION" : "ACTIVE",
        emailVerified: !byEmail,
      })
      .returning();
    if (created!.role === "COACH") await tx.insert(coachProfile).values({ coachId: created!.id });
    if (hash) await setCredentialPassword(tx, created!.id, hash);
    const token = byEmail ? await issueActivationToken(tx, created!.id) : null;
    await audit(tx, {
      actor_id: a.user.id,
      action: "USER_CREATED",
      entity_type: "user",
      entity_id: created!.id,
      reason: null,
      metadata: { role: data.role, email: data.email, activation: byEmail ? "EMAIL" : "TEMPORARY_PASSWORD" },
    });
    return { created: created!, token };
  });
  if (token) await sendActivationEmail(created, token);
  return { ...toPublicUser(created), temporary_password: temporaryPassword };
}

export async function updateUser(call: LiveCall, userId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ full_name: zText(2, 120, "Le nom"), email: zEmail, phone: zPhone }), input);
  return db.transaction(async (tx) => {
    const u = await getUser(tx, String(userId), { forUpdate: true });
    await assertEmailFree(tx, data.email, u.id);
    const before = { full_name: u.name, email: u.email, phone: u.phone };
    const [updated] = await tx
      .update(user)
      .set({ name: data.full_name, email: data.email, phone: data.phone ? data.phone : null, updatedAt: new Date() })
      .where(eq(user.id, u.id))
      .returning();
    await audit(tx, { actor_id: a.user.id, action: "USER_UPDATED", entity_type: "user", entity_id: u.id, reason: null, metadata: { before, after: data } });
    return toPublicUser(updated!);
  });
}

async function openRequestCount(tx: Tx, column: typeof coachingRequest.learnerId | typeof coachingRequest.coachId, id: string) {
  const n = (await tx
    .select({ n: count() })
    .from(coachingRequest)
    .where(and(eq(column, id), inArray(coachingRequest.status, OPEN_STATUSES))))[0]?.n ?? 0;
  return n;
}

export async function changeRole(call: LiveCall, userId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ role: z.enum(ROLES), reason: zReason() }), input);
  return db.transaction(async (tx) => {
    const u = await getUser(tx, String(userId), { forUpdate: true });
    if (u.id === a.user.id) throw businessRule("Vous ne pouvez pas modifier votre propre rôle.");
    if (u.role === data.role) throw businessRule("L’utilisateur possède déjà ce rôle.");
    if (u.role === "COACH") {
      const n = (await tx
        .select({ n: count() })
        .from(coachAssignment)
        .where(and(eq(coachAssignment.coachId, u.id), eq(coachAssignment.status, "ACTIVE"))))[0]?.n ?? 0;
      if (n > 0) throw businessRule("Ce coach a encore des apprenants affectés. Modifiez d’abord les affectations.");
      if ((await openRequestCount(tx, coachingRequest.coachId, u.id)) > 0) {
        throw businessRule("Ce coach est responsable de demandes ouvertes. Réaffectez-les d’abord.");
      }
    }
    if (u.role === "LEARNER" && (await openRequestCount(tx, coachingRequest.learnerId, u.id)) > 0) {
      throw businessRule("Cet apprenant a des demandes ouvertes ; son rôle ne peut pas être modifié.");
    }
    const [updated] = await tx.update(user).set({ role: data.role as Role, updatedAt: new Date() }).where(eq(user.id, u.id)).returning();
    if (data.role === "COACH") await tx.insert(coachProfile).values({ coachId: u.id }).onConflictDoNothing();
    // Les sessions existantes sont révoquées : les droits changent.
    await tx.delete(session).where(eq(session.userId, u.id));
    await audit(tx, { actor_id: a.user.id, action: "USER_ROLE_CHANGED", entity_type: "user", entity_id: u.id, reason: data.reason, metadata: { from: u.role, to: data.role } });
    return toPublicUser(updated!);
  });
}

export async function setUserStatus(call: LiveCall, userId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ action: z.enum(["SUSPEND", "REACTIVATE"]), reason: zReason() }), input);
  return db.transaction(async (tx) => {
    // Verrouille les administrateurs actifs : deux suspensions simultanées ne peuvent pas
    // retirer ensemble le dernier administrateur.
    await tx.select({ id: user.id }).from(user).where(and(eq(user.role, "ADMIN"), eq(user.status, "ACTIVE"))).for("update");
    const u = await getUser(tx, String(userId), { forUpdate: true });
    let status = u.status;

    if (data.action === "SUSPEND") {
      if (u.id === a.user.id) throw businessRule("Vous ne pouvez pas suspendre votre propre compte.");
      if (u.status === "SUSPENDED") throw businessRule("Ce compte est déjà suspendu.");
      if (u.role === "ADMIN" && (await activeAdmins(tx)).filter((x) => x.id !== u.id).length === 0) {
        throw businessRule("Impossible de suspendre le dernier administrateur actif.");
      }
      status = "SUSPENDED";
      await tx.delete(session).where(eq(session.userId, u.id));
      if (u.role === "COACH") {
        const open = await openRequestCount(tx, coachingRequest.coachId, u.id);
        if (open > 0) {
          await notify(tx, {
            recipients: await activeAdmins(tx),
            type: "COACH_UNAVAILABLE",
            title: `Coach suspendu avec ${open} demande(s) ouverte(s)`,
            summary: `${u.name} a été suspendu alors que ${open} demande(s) restent ouvertes. Réaffectez-les pour assurer la continuité du service.`,
            eventKey: `COACH_SUSPENDED_SUMMARY:${u.id}:${new Date().toISOString()}`,
          });
        }
      }
    } else {
      if (u.status !== "SUSPENDED") throw businessRule("Seul un compte suspendu peut être réactivé.");
      const [cred] = await tx
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, u.id), eq(account.providerId, "credential"), isNotNull(account.password)));
      status = cred ? "ACTIVE" : "PENDING_ACTIVATION";
    }

    const [updated] = await tx.update(user).set({ status, updatedAt: new Date() }).where(eq(user.id, u.id)).returning();
    await audit(tx, {
      actor_id: a.user.id,
      action: data.action === "SUSPEND" ? "USER_SUSPENDED" : "USER_REACTIVATED",
      entity_type: "user",
      entity_id: u.id,
      reason: data.reason,
    });
    return toPublicUser(updated!);
  });
}

/**
 * Réinitialisation de l'accès. Avec activation par e-mail : nouveau lien (activation ou réinitialisation).
 * Sinon : nouveau mot de passe provisoire remis à l'administrateur ; il remplace l'ancien, active un compte
 * en attente et ferme les sessions ouvertes.
 */
export async function resendAccess(call: LiveCall, userId: string) {
  const a = await authenticate(call, "ADMIN");
  const u = await getUser(db, String(userId));
  if (u.status === "SUSPENDED") throw businessRule("Réactivez d’abord ce compte.");

  if (!activationByEmail()) {
    const temporaryPassword = generateTemporaryPassword();
    const hash = await hashPassword(temporaryPassword);
    await db.transaction(async (tx) => {
      await getUser(tx, u.id, { forUpdate: true });
      await setCredentialPassword(tx, u.id, hash);
      await tx.delete(session).where(eq(session.userId, u.id));
      if (u.status === "PENDING_ACTIVATION") await tx.update(user).set({ status: "ACTIVE", emailVerified: true, updatedAt: new Date() }).where(eq(user.id, u.id));
      await audit(tx, { actor_id: a.user.id, action: "TEMPORARY_PASSWORD_ISSUED", entity_type: "user", entity_id: u.id, reason: null });
    });
    return { purpose: "TEMPORARY_PASSWORD" as const, temporary_password: temporaryPassword };
  }

  const purpose = u.status === "PENDING_ACTIVATION" ? "ACTIVATION" : "PASSWORD_RESET";
  if (purpose === "ACTIVATION") {
    const token = await db.transaction((tx) => issueActivationToken(tx, u.id));
    await sendActivationEmail(u, token);
  } else {
    await auth.api.requestPasswordReset({ body: { email: u.email, redirectTo: "/reset-password" } });
  }
  await audit(db, { actor_id: a.user.id, action: purpose === "ACTIVATION" ? "ACTIVATION_RESENT" : "ACCESS_RESET_SENT", entity_type: "user", entity_id: u.id, reason: null });
  return { purpose, temporary_password: null };
}
