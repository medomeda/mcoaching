/**
 * Authentification de l'opérateur (BetterAuth) : un seul compte, sans inscription publique,
 * mot de passe + code temporaire (TOTP) obligatoire, verrouillage après échecs répétés.
 * L'API est exposée sous /api/admin/auth (donc uniquement sur l'hôte d'administration).
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { eq, sql } from "drizzle-orm";
import { db as appDb, schema, type SiteDb } from "@/db/client";

export const MAX_LOGIN_FAILURES = 5;
export const LOCK_MINUTES = 15;
export const SESSION_SECONDS = 8 * 60 * 60;
export const AUTH_BASE_PATH = "/api/admin/auth";

const LOCKED_MESSAGE = `Trop de tentatives. Réessayez dans ${LOCK_MINUTES} minutes.`;
const norm = (s: string) => s.trim().toLowerCase();

export type AuthDb = SiteDb;

export interface AuthOptions {
  baseURL?: string;
  secret?: string;
}

/** Adresse de l'hôte d'administration : ADMIN_HOST avec le schéma de SITE_URL (https en production, http en local). */
export function adminBaseUrl(adminHost = process.env.ADMIN_HOST, siteUrl = process.env.SITE_URL): string | undefined {
  if (!adminHost) return undefined;
  let scheme = "https:";
  try {
    if (siteUrl) scheme = new URL(siteUrl).protocol;
  } catch {
    /* SITE_URL invalide : https par défaut */
  }
  return `${scheme}//${adminHost}`;
}

/** Fabrique de l'authentification ; `database` et les options sont injectables pour les tests. */
export function createAuth(database: AuthDb, opts: AuthOptions = {}) {
  const { loginAttempt, auditLog } = schema;

  async function assertNotLocked(email: string) {
    const [a] = await database.select().from(loginAttempt).where(eq(loginAttempt.email, email));
    if (a?.lockedUntil && a.lockedUntil.getTime() > Date.now()) throw new APIError("TOO_MANY_REQUESTS", { message: LOCKED_MESSAGE });
  }

  async function recordFailure(email: string) {
    const [a] = await database
      .insert(loginAttempt)
      .values({ email, failures: 1, lastFailureAt: new Date() })
      .onConflictDoUpdate({ target: loginAttempt.email, set: { failures: sql`${loginAttempt.failures} + 1`, lastFailureAt: new Date() } })
      .returning();
    if (!a || a.failures < MAX_LOGIN_FAILURES) return;
    await database.update(loginAttempt).set({ failures: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }).where(eq(loginAttempt.email, email));
    await database.insert(auditLog).values({ action: "LOGIN_LOCKED", target: email });
  }

  /** Clé de verrouillage : l'adresse saisie (connexion) ; pour le second facteur, l'unique compte opérateur. */
  async function lockKeyOf(path: string, body: unknown): Promise<string | null> {
    if (path === "/sign-in/email") {
      const email = (body as { email?: unknown } | undefined)?.email;
      return typeof email === "string" ? norm(email) : null;
    }
    if (path === "/two-factor/verify-totp" || path === "/two-factor/verify-backup-code") {
      const [u] = await database.select({ email: schema.user.email }).from(schema.user).limit(1);
      return u ? norm(u.email) : null;
    }
    return null;
  }

  const baseURL = opts.baseURL ?? adminBaseUrl();

  return betterAuth({
    baseURL,
    basePath: AUTH_BASE_PATH,
    // Seul l'hôte d'administration est une origine de confiance.
    trustedOrigins: baseURL ? [baseURL] : [],
    secret: opts.secret ?? process.env.AUTH_SECRET,
    database: drizzleAdapter(database, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: SESSION_SECONDS, updateAge: 10 * 60 },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      customRules: { "/sign-in/email": { window: 60, max: 10 } },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const email = await lockKeyOf(ctx.path, ctx.body);
        if (email) await assertNotLocked(email);
      }),
      after: createAuthMiddleware(async (ctx) => {
        const email = await lockKeyOf(ctx.path, ctx.body);
        if (!email) return;
        const returned = ctx.context.returned;
        if (returned instanceof APIError) {
          if (returned.statusCode === 401 || returned.statusCode === 400) await recordFailure(email);
          return;
        }
        // Mot de passe juste mais second facteur encore à fournir : ce n'est pas une connexion réussie,
        // le compteur n'est remis à zéro qu'une fois la session complète délivrée.
        if (ctx.path === "/sign-in/email") {
          const [u] = await database.select({ tf: schema.user.twoFactorEnabled }).from(schema.user).where(eq(schema.user.email, email));
          if (u?.tf) return;
        }
        await database.delete(loginAttempt).where(eq(loginAttempt.email, email));
      }),
    },
    plugins: [twoFactor({ issuer: "Mentora (opérateur)", backupCodeOptions: { amount: 10 } }), nextCookies()],
  });
}

export type OperatorAuth = ReturnType<typeof createAuth>;

let instance: OperatorAuth | undefined;
/** Instance de production (création paresseuse : aucune variable requise à la compilation). */
export function getAuth(): OperatorAuth {
  instance ??= createAuth(appDb);
  return instance;
}

export class OperatorAuthError extends Error {
  constructor(message: string, readonly code: "UNAUTHENTICATED" | "TWO_FACTOR_REQUIRED") {
    super(message);
  }
}

/** Exige une session valide ET le second facteur activé ; renvoie l'identifiant de l'opérateur. */
export async function requireOperator(headers: Headers, a: OperatorAuth = getAuth()): Promise<{ userId: string }> {
  const s = await a.api.getSession({ headers });
  if (!s) throw new OperatorAuthError("Veuillez vous connecter.", "UNAUTHENTICATED");
  if (!(s.user as { twoFactorEnabled?: boolean }).twoFactorEnabled) {
    throw new OperatorAuthError("La double authentification doit être activée avant d’accéder au tableau de bord.", "TWO_FACTOR_REQUIRED");
  }
  return { userId: s.user.id };
}
