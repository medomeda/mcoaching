/**
 * Authentification (PRD §9.1, §13.2) : connexion, sessions expirantes, anti-bruteforce,
 * activation et réinitialisation par jeton à usage unique, changement de mot de passe.
 */
import { z } from "zod";
import { AppError, businessRule, validation } from "@/modules/core/errors";
import { zPassword } from "@/modules/core/password";
import { zEmail } from "@/modules/core/validation";
import type { Database, User } from "@/modules/core/types";
import { hashPassword, newId, normalizeEmail, randomToken, safeEqual, sha256 } from "../crypto";
import { audit } from "../db/helpers";
import { queueTransactionalEmail } from "../notify";
import { authenticate, parse, reauth, resolveSession, SESSION_MAX_HOURS, store, zText, type Call } from "./context";

export const MAX_LOGIN_FAILURES = 5;
export const LOCK_MINUTES = 15;
export const ACTIVATION_TTL_HOURS = 72;
export const RESET_TTL_MINUTES = 60;

export { zPassword };

export { zEmail };

export interface PublicUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: User["role"];
  status: User["status"];
  last_login_at: string | null;
  created_at: string;
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    last_login_at: u.last_login_at,
    created_at: u.created_at,
  };
}

async function createSession(db: Database, user: User, now: Date) {
  const token = randomToken();
  db.sessions.push({
    id: newId("ses"),
    token_hash: await sha256(token),
    user_id: user.id,
    created_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SESSION_MAX_HOURS * 3600_000).toISOString(),
    revoked_at: null,
  });
  return token;
}

/** Crée un jeton à usage unique et renvoie sa valeur en clair (transmise uniquement par e-mail). */
export async function issueAuthToken(db: Database, now: Date, user: User, purpose: "ACTIVATION" | "PASSWORD_RESET") {
  const token = randomToken();
  const real = store().realNow();
  for (const t of db.auth_tokens) {
    if (t.user_id === user.id && t.purpose === purpose && !t.used_at) t.used_at = real.toISOString(); // invalide les précédents
  }
  const ttl = purpose === "ACTIVATION" ? ACTIVATION_TTL_HOURS * 3600_000 : RESET_TTL_MINUTES * 60_000;
  db.auth_tokens.push({
    id: newId("tok"),
    user_id: user.id,
    purpose,
    token_hash: await sha256(token),
    expires_at: new Date(real.getTime() + ttl).toISOString(),
    used_at: null,
    created_at: real.toISOString(),
  });
  const path = purpose === "ACTIVATION" ? "/activate" : "/reset-password";
  queueTransactionalEmail(db, now, user, purpose === "ACTIVATION" ? "ACCOUNT_ACTIVATION" : "PASSWORD_RESET", `${path}?token=${token}`);
  return token;
}

export async function systemStatus() {
  const db = store().snapshot();
  return {
    hasUsers: db.users.length > 0,
    demoSeeded: db.meta.demo_seeded,
    activationByEmail: true,
    now: store().now(db).toISOString(),
  };
}

/** Création du premier administrateur, possible uniquement sur une base sans utilisateur. */
export async function bootstrapAdmin(input: unknown) {
  const data = parse(
    z.object({ full_name: zText(2, 120, "Le nom"), email: zEmail, password: zPassword }),
    input,
  );
  const pwd = await hashPassword(data.password);
  await store().transaction((db, now) => {
    if (db.users.length > 0) throw businessRule("La plateforme est déjà initialisée.");
    const iso = now.toISOString();
    const user: User = {
      id: newId("usr"),
      full_name: data.full_name,
      email: data.email,
      phone: null,
      role: "ADMIN",
      status: "ACTIVE",
      created_at: iso,
      updated_at: iso,
      last_login_at: null,
      is_demo: false,
    };
    db.users.push(user);
    db.credentials.push({ user_id: user.id, password_hash: pwd.hash, salt: pwd.salt, iterations: pwd.iterations, updated_at: iso });
    audit(db, now, { actor_id: user.id, action: "BOOTSTRAP_ADMIN", entity_type: "user", entity_id: user.id, reason: null });
  });
}

const GENERIC_LOGIN_ERROR = "Adresse e-mail ou mot de passe incorrect.";

export async function login(input: unknown): Promise<{ token: string; user: PublicUser }> {
  const data = parse(z.object({ email: zEmail, password: z.string().min(1, "Le mot de passe est requis.").max(128) }), input);
  const s = store();
  const snap = s.snapshot();
  const now = s.realNow();
  const attempt = snap.login_attempts.find((a) => a.email === data.email);
  if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > now.getTime()) {
    throw new AppError("RATE_LIMITED", `Trop de tentatives. Réessayez dans ${LOCK_MINUTES} minutes.`);
  }
  const user = snap.users.find((u) => u.email === data.email);
  const cred = user ? snap.credentials.find((c) => c.user_id === user.id) : undefined;
  // Hachage systématique pour un temps de réponse homogène, même si le compte n'existe pas.
  const computed = await hashPassword(data.password, cred?.salt ?? "constant-time-dummy-salt", cred?.iterations);
  const ok = !!cred && safeEqual(computed.hash, cred.password_hash);

  if (!ok || !user) {
    await s.transaction((db) => {
      const n = s.realNow();
      let a = db.login_attempts.find((x) => x.email === data.email);
      if (!a) {
        a = { email: data.email, failures: 0, locked_until: null, last_failure_at: null };
        db.login_attempts.push(a);
      }
      a.failures += 1;
      a.last_failure_at = n.toISOString();
      if (a.failures >= MAX_LOGIN_FAILURES) {
        a.locked_until = new Date(n.getTime() + LOCK_MINUTES * 60_000).toISOString();
        a.failures = 0;
        audit(db, n, { actor_id: null, action: "LOGIN_LOCKED", entity_type: "user", entity_id: user?.id ?? null, reason: null, metadata: { email: data.email } });
      }
    });
    throw new AppError("UNAUTHENTICATED", GENERIC_LOGIN_ERROR);
  }
  if (user.status === "PENDING_ACTIVATION") {
    throw new AppError("FORBIDDEN", "Votre compte n’est pas encore activé. Utilisez le lien reçu par e-mail.");
  }
  if (user.status === "SUSPENDED") {
    throw new AppError("FORBIDDEN", "Votre compte est suspendu. Contactez l’administrateur.");
  }
  return s.transaction(async (db) => {
    const n = s.realNow();
    db.login_attempts = db.login_attempts.filter((x) => x.email !== data.email);
    const u = db.users.find((x) => x.id === user.id)!;
    u.last_login_at = n.toISOString();
    const token = await createSession(db, u, n);
    return { token, user: toPublicUser(u) };
  });
}

export async function logout(call: Call) {
  if (!call.token) return;
  const hash = await sha256(call.token);
  await store().transaction((db) => {
    const sess = db.sessions.find((x) => x.token_hash === hash);
    if (sess && !sess.revoked_at) sess.revoked_at = store().realNow().toISOString();
  });
}

export async function me(call: Call): Promise<PublicUser> {
  const a = await authenticate(call);
  return toPublicUser(a.user);
}

/** Réponse identique que le compte existe ou non (pas de divulgation). */
export async function requestPasswordReset(input: unknown) {
  const data = parse(z.object({ email: zEmail }), input);
  const db0 = store().snapshot();
  const user = db0.users.find((u) => u.email === data.email);
  if (user && user.status === "ACTIVE") {
    await store().transaction(async (db, now) => {
      const u = db.users.find((x) => x.id === user.id)!;
      await issueAuthToken(db, now, u, "PASSWORD_RESET");
      audit(db, now, { actor_id: null, action: "PASSWORD_RESET_REQUESTED", entity_type: "user", entity_id: u.id, reason: null });
    });
  }
  return { message: "Si un compte actif correspond à cette adresse, un e-mail de réinitialisation vient d’être envoyé." };
}

async function findValidToken(db: Database, token: string, purpose: "ACTIVATION" | "PASSWORD_RESET", now: Date) {
  const hash = await sha256(token);
  const t = db.auth_tokens.find((x) => x.token_hash === hash && x.purpose === purpose);
  if (!t || t.used_at || new Date(t.expires_at).getTime() <= now.getTime()) {
    throw businessRule("Ce lien est invalide ou a expiré. Demandez un nouveau lien.");
  }
  const user = db.users.find((u) => u.id === t.user_id);
  if (!user) throw businessRule("Ce lien est invalide ou a expiré.");
  return { t, user };
}

export async function inspectToken(input: unknown) {
  const data = parse(z.object({ token: z.string().min(10).max(200), purpose: z.enum(["ACTIVATION", "PASSWORD_RESET"]) }), input);
  const db = store().snapshot();
  const { user } = await findValidToken(db, data.token, data.purpose, store().realNow());
  return { full_name: user.full_name, email: user.email };
}

export async function completeToken(input: unknown) {
  const data = parse(
    z.object({ token: z.string().min(10).max(200), purpose: z.enum(["ACTIVATION", "PASSWORD_RESET"]), password: zPassword }),
    input,
  );
  const pwd = await hashPassword(data.password);
  await store().transaction(async (db, now) => {
    const { t, user } = await findValidToken(db, data.token, data.purpose, store().realNow());
    if (user.status === "SUSPENDED") throw businessRule("Ce compte est suspendu. Contactez l’administrateur.");
    const iso = now.toISOString();
    t.used_at = iso;
    db.credentials = db.credentials.filter((c) => c.user_id !== user.id);
    db.credentials.push({ user_id: user.id, password_hash: pwd.hash, salt: pwd.salt, iterations: pwd.iterations, updated_at: iso });
    for (const sess of db.sessions) if (sess.user_id === user.id && !sess.revoked_at) sess.revoked_at = iso;
    if (data.purpose === "ACTIVATION") {
      if (user.status !== "PENDING_ACTIVATION") throw businessRule("Ce compte est déjà activé.");
      user.status = "ACTIVE";
    }
    user.updated_at = iso;
    audit(db, now, {
      actor_id: user.id,
      action: data.purpose === "ACTIVATION" ? "ACCOUNT_ACTIVATED" : "PASSWORD_RESET_COMPLETED",
      entity_type: "user",
      entity_id: user.id,
      reason: null,
    });
  });
}

export async function changePassword(call: Call, input: unknown) {
  const a = await authenticate(call);
  const data = parse(z.object({ current: z.string().min(1, "Mot de passe actuel requis."), next: zPassword }), input);
  const db0 = store().snapshot();
  const cred = db0.credentials.find((c) => c.user_id === a.user.id);
  const check = cred ? await hashPassword(data.current, cred.salt, cred.iterations) : null;
  if (!cred || !check || !safeEqual(check.hash, cred.password_hash)) {
    throw validation("Mot de passe actuel incorrect.", { current: "Mot de passe actuel incorrect." });
  }
  const pwd = await hashPassword(data.next);
  await store().transaction((db, now) => {
    reauth(db, a);
    const iso = now.toISOString();
    db.credentials = db.credentials.filter((c) => c.user_id !== a.user.id);
    db.credentials.push({ user_id: a.user.id, password_hash: pwd.hash, salt: pwd.salt, iterations: pwd.iterations, updated_at: iso });
    // Invalide les autres sessions, conserve la session courante.
    for (const s of db.sessions) if (s.user_id === a.user.id && s.id !== a.session.id && !s.revoked_at) s.revoked_at = iso;
    audit(db, now, { actor_id: a.user.id, action: "PASSWORD_CHANGED", entity_type: "user", entity_id: a.user.id, reason: null });
  });
}

export async function updateMyProfile(call: Call, input: unknown) {
  const a = await authenticate(call);
  const data = parse(
    z.object({
      full_name: zText(2, 120, "Le nom"),
      phone: z.string().trim().max(30).regex(/^[+0-9 ()-]*$/, "Numéro de téléphone invalide.").optional().nullable(),
    }),
    input,
  );
  return store().transaction((db, now) => {
    const u = reauth(db, a);
    u.full_name = data.full_name;
    u.phone = data.phone ? data.phone : null;
    u.updated_at = now.toISOString();
    return toPublicUser(u);
  });
}

/** Utilisé par la page « session expirée » : indique si un jeton est encore valide. */
export async function checkSession(call: Call) {
  const db = store().snapshot();
  try {
    await resolveSession(db, call.token, store().realNow());
    return { valid: true as const };
  } catch (e) {
    return { valid: false as const, reason: e instanceof AppError ? e.code : "UNAUTHENTICATED" };
  }
}
