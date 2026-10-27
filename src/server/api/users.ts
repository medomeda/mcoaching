/** Gestion des utilisateurs par l'administrateur (PRD §9.2). Aucune suppression physique. */
import { z } from "zod";
import { businessRule, conflict } from "@/modules/core/errors";
import { ROLES, type Database, type User } from "@/modules/core/types";
import { effectiveEntitlementStatus } from "@/modules/entitlements/entitlements";
import { isOpen } from "@/modules/requests/stateMachine";
import { zPhone } from "@/modules/core/validation";
import { newId } from "../crypto";
import { activeAssignment, audit, currentEntitlement, getUser, paginate, userName } from "../db/helpers";
import { activeAdmins, notify } from "../notify";
import { issueAuthToken, toPublicUser, zEmail } from "./auth";
import { authenticate, parse, reauth, store, zReason, zText, type Call } from "./context";

export function userRow(db: Database, u: User, now: Date) {
  const assignment = u.role === "LEARNER" ? activeAssignment(db, u.id) : undefined;
  const ent = u.role === "LEARNER" ? currentEntitlement(db, u.id) : undefined;
  return {
    ...toPublicUser(u),
    is_demo: u.is_demo,
    coach: assignment ? { id: assignment.coach_id, full_name: userName(db, assignment.coach_id) } : null,
    entitlement_status: u.role === "LEARNER" ? effectiveEntitlementStatus(ent, now) : null,
    assigned_learners: u.role === "COACH" ? db.coach_assignments.filter((a) => a.coach_id === u.id && a.status === "ACTIVE").length : null,
  };
}
export type UserRow = ReturnType<typeof userRow>;

const zListUsers = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(["PENDING_ACTIVATION", "ACTIVE", "SUSPENDED"]).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export async function listUsers(call: Call, input: unknown) {
  await authenticate(call, "ADMIN");
  const f = parse(zListUsers, input ?? {});
  const db = store().snapshot();
  const now = store().now(db);
  const q = f.q?.toLowerCase();
  const items = db.users
    .filter((u) => (!f.role || u.role === f.role) && (!f.status || u.status === f.status))
    .filter((u) => !q || u.full_name.toLowerCase().includes(q) || u.email.includes(q))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "fr"))
    .map((u) => userRow(db, u, now));
  return paginate(items, f.page, f.pageSize);
}

export async function getUserDetail(call: Call, userId: string) {
  await authenticate(call, "ADMIN");
  const db = store().snapshot();
  const now = store().now(db);
  const u = getUser(db, userId);
  const requests = db.coaching_requests.filter((r) => r.learner_id === u.id || r.coach_id === u.id);
  return {
    user: userRow(db, u, now),
    assignments: db.coach_assignments
      .filter((a) => a.learner_id === u.id || a.coach_id === u.id)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .map((a) => ({
        ...a,
        learner_name: userName(db, a.learner_id),
        coach_name: userName(db, a.coach_id),
        assigned_by_name: userName(db, a.assigned_by),
        ended_by_name: a.ended_by ? userName(db, a.ended_by) : null,
      })),
    stats: {
      requests_total: requests.filter((r) => r.status !== "DRAFT").length,
      requests_open: requests.filter((r) => isOpen(r.status)).length,
    },
    audit: db.audit_logs
      .filter((l) => l.entity_id === u.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 50)
      .map((l) => ({ ...l, actor_name: userName(db, l.actor_id) })),
  };
}

export async function createUser(call: Call, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(
    z.object({ full_name: zText(2, 120, "Le nom"), email: zEmail, role: z.enum(ROLES), phone: zPhone }),
    input,
  );
  return store().transaction(async (db, now) => {
    reauth(db, a);
    if (db.users.some((u) => u.email === data.email)) throw conflict("Un compte existe déjà avec cette adresse e-mail.");
    const iso = now.toISOString();
    const user: User = {
      id: newId("usr"),
      full_name: data.full_name,
      email: data.email,
      phone: data.phone ? data.phone : null,
      role: data.role,
      status: "PENDING_ACTIVATION",
      created_at: iso,
      updated_at: iso,
      last_login_at: null,
      is_demo: false,
    };
    db.users.push(user);
    if (user.role === "COACH") db.coach_profiles.push({ coach_id: user.id, bio: "", specialties: [], updated_at: iso });
    await issueAuthToken(db, now, user, "ACTIVATION");
    audit(db, now, { actor_id: a.user.id, action: "USER_CREATED", entity_type: "user", entity_id: user.id, reason: null, metadata: { role: user.role, email: user.email } });
    // Même contrat que le serveur : la démo active toujours par e-mail (boîte mail simulée).
    return { ...toPublicUser(user), temporary_password: null as string | null };
  });
}

export async function updateUser(call: Call, userId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ full_name: zText(2, 120, "Le nom"), email: zEmail, phone: zPhone }), input);
  return store().transaction((db, now) => {
    reauth(db, a);
    const u = getUser(db, userId);
    if (db.users.some((x) => x.email === data.email && x.id !== u.id)) throw conflict("Cette adresse e-mail est déjà utilisée.");
    const before = { full_name: u.full_name, email: u.email, phone: u.phone };
    u.full_name = data.full_name;
    u.email = data.email;
    u.phone = data.phone ? data.phone : null;
    u.updated_at = now.toISOString();
    audit(db, now, { actor_id: a.user.id, action: "USER_UPDATED", entity_type: "user", entity_id: u.id, reason: null, metadata: { before, after: data } });
    return toPublicUser(u);
  });
}

export async function changeRole(call: Call, userId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ role: z.enum(ROLES), reason: zReason() }), input);
  return store().transaction((db, now) => {
    reauth(db, a);
    const u = getUser(db, userId);
    if (u.id === a.user.id) throw businessRule("Vous ne pouvez pas modifier votre propre rôle.");
    if (u.role === data.role) throw businessRule("L’utilisateur possède déjà ce rôle.");
    if (u.role === "COACH") {
      if (db.coach_assignments.some((x) => x.coach_id === u.id && x.status === "ACTIVE")) {
        throw businessRule("Ce coach a encore des apprenants affectés. Modifiez d’abord les affectations.");
      }
      if (db.coaching_requests.some((r) => r.coach_id === u.id && isOpen(r.status))) {
        throw businessRule("Ce coach est responsable de demandes ouvertes. Réaffectez-les d’abord.");
      }
    }
    if (u.role === "LEARNER" && db.coaching_requests.some((r) => r.learner_id === u.id && isOpen(r.status))) {
      throw businessRule("Cet apprenant a des demandes ouvertes ; son rôle ne peut pas être modifié.");
    }
    const old = u.role;
    u.role = data.role;
    u.updated_at = now.toISOString();
    if (u.role === "COACH" && !db.coach_profiles.some((p) => p.coach_id === u.id)) {
      db.coach_profiles.push({ coach_id: u.id, bio: "", specialties: [], updated_at: now.toISOString() });
    }
    // Les sessions existantes sont révoquées : les droits changent.
    for (const s of db.sessions) if (s.user_id === u.id && !s.revoked_at) s.revoked_at = now.toISOString();
    audit(db, now, { actor_id: a.user.id, action: "USER_ROLE_CHANGED", entity_type: "user", entity_id: u.id, reason: data.reason, metadata: { from: old, to: u.role } });
    return toPublicUser(u);
  });
}

export async function setUserStatus(call: Call, userId: string, input: unknown) {
  const a = await authenticate(call, "ADMIN");
  const data = parse(z.object({ action: z.enum(["SUSPEND", "REACTIVATE"]), reason: zReason() }), input);
  return store().transaction((db, now) => {
    reauth(db, a);
    const u = getUser(db, userId);
    const iso = now.toISOString();
    if (data.action === "SUSPEND") {
      if (u.id === a.user.id) throw businessRule("Vous ne pouvez pas suspendre votre propre compte.");
      if (u.status === "SUSPENDED") throw businessRule("Ce compte est déjà suspendu.");
      if (u.role === "ADMIN" && activeAdmins(db).filter((x) => x.id !== u.id).length === 0) {
        throw businessRule("Impossible de suspendre le dernier administrateur actif.");
      }
      u.status = "SUSPENDED";
      for (const s of db.sessions) if (s.user_id === u.id && !s.revoked_at) s.revoked_at = iso;
      if (u.role === "COACH") {
        const open = db.coaching_requests.filter((r) => r.coach_id === u.id && isOpen(r.status));
        if (open.length > 0) {
          notify(db, now, {
            recipients: activeAdmins(db),
            type: "COACH_UNAVAILABLE",
            title: `Coach suspendu avec ${open.length} demande(s) ouverte(s)`,
            summary: `${u.full_name} a été suspendu alors que ${open.length} demande(s) restent ouvertes. Réaffectez-les pour assurer la continuité du service.`,
            eventKey: `COACH_SUSPENDED_SUMMARY:${u.id}:${iso}`,
          });
        }
      }
    } else {
      if (u.status !== "SUSPENDED") throw businessRule("Seul un compte suspendu peut être réactivé.");
      const hasPassword = db.credentials.some((c) => c.user_id === u.id);
      u.status = hasPassword ? "ACTIVE" : "PENDING_ACTIVATION";
    }
    u.updated_at = iso;
    audit(db, now, {
      actor_id: a.user.id,
      action: data.action === "SUSPEND" ? "USER_SUSPENDED" : "USER_REACTIVATED",
      entity_type: "user",
      entity_id: u.id,
      reason: data.reason,
    });
    return toPublicUser(u);
  });
}

/** Réinitialisation de l'accès : nouveau lien d'activation (compte en attente) ou de réinitialisation. */
export async function resendAccess(call: Call, userId: string) {
  const a = await authenticate(call, "ADMIN");
  return store().transaction(async (db, now) => {
    reauth(db, a);
    const u = getUser(db, userId);
    if (u.status === "SUSPENDED") throw businessRule("Réactivez d’abord ce compte.");
    const purpose = u.status === "PENDING_ACTIVATION" ? "ACTIVATION" : "PASSWORD_RESET";
    await issueAuthToken(db, now, u, purpose);
    audit(db, now, { actor_id: a.user.id, action: purpose === "ACTIVATION" ? "ACTIVATION_RESENT" : "ACCESS_RESET_SENT", entity_type: "user", entity_id: u.id, reason: null });
    return { purpose: purpose as string, temporary_password: null as string | null };
  });
}
