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

/** Adresse de l'hôte d'administration déduite de ADMIN_HOST (http en local, https sinon). */
export function adminBaseUrl(adminHost = process.env.ADMIN_HOST): string | undefined {
  if (!adminHost) return undefined;
  const local = adminHost.startsWith("localhost") || adminHost.includes(".localhost");
  return `${local ? "http" : "https"}://${adminHost}`;
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
        if (ctx.path !== "/sign-in/email") return;
        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof email === "string") await assertNotLocked(norm(email));
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof email !== "string") return;
        const returned = ctx.context.returned;
        if (returned instanceof APIError) {
          if (returned.statusCode === 401 || returned.statusCode === 400) await recordFailure(norm(email));
        } else {
          await database.delete(loginAttempt).where(eq(loginAttempt.email, norm(email)));
        }
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
