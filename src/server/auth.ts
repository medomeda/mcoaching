/**
 * Authentification (PRD §9.1, §13.2) via BetterAuth sur PostgreSQL.
 * Pas d'inscription publique : les comptes sont créés par l'administrateur.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq, sql } from "drizzle-orm";
import { zPassword } from "@/modules/core/password";
import { normalizeEmail } from "@/modules/core/validation";
import { newId } from "./crypto";
import { sendTransactionalEmail } from "./live/helpers";
import { db, schema } from "./pg/client";

export const SESSION_IDLE_SECONDS = 2 * 60 * 60;
export const MAX_LOGIN_FAILURES = 5;
export const LOCK_MINUTES = 15;
export const RESET_TTL_SECONDS = 60 * 60;

const PASSWORD_ROUTES = ["/sign-up/email", "/reset-password", "/change-password"];
const LOCKED_MESSAGE = `Trop de tentatives. Réessayez dans ${LOCK_MINUTES} minutes.`;
const { loginAttempt } = schema;

/** Verrou par compte (PRD §13.2) : refuse la tentative tant que l'adresse est verrouillée. */
async function assertNotLocked(email: string) {
  const [a] = await db.select().from(loginAttempt).where(eq(loginAttempt.email, email));
  if (a?.lockedUntil && a.lockedUntil.getTime() > Date.now()) {
    throw new APIError("TOO_MANY_REQUESTS", { message: LOCKED_MESSAGE });
  }
}

/** Compte un échec ; au 5ᵉ, verrouille l'adresse et trace l'événement (compte existant ou non). */
async function recordLoginFailure(email: string) {
  const [a] = await db
    .insert(loginAttempt)
    .values({ email, failures: 1, lastFailureAt: new Date() })
    .onConflictDoUpdate({
      target: loginAttempt.email,
      set: { failures: sql`${loginAttempt.failures} + 1`, lastFailureAt: new Date() },
    })
    .returning();
  if (!a || a.failures < MAX_LOGIN_FAILURES) return;
  await db
    .update(loginAttempt)
    .set({ failures: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) })
    .where(eq(loginAttempt.email, email));
  const [u] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email));
  await db.insert(schema.auditLog).values({
    id: newId("aud"),
    action: "LOGIN_LOCKED",
    entityType: "user",
    entityId: u?.id ?? null,
    metadata: { email },
  });
}

export const auth = betterAuth({
  baseURL: process.env.APP_URL,
  secret: process.env.AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "LEARNER", input: false },
      status: { type: "string", required: false, defaultValue: "PENDING_ACTIVATION", input: false },
      phone: { type: "string", required: false },
      lastLoginAt: { type: "date", required: false, input: false },
      isDemo: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: RESET_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Seuls les comptes actifs reçoivent un lien ; la réponse HTTP reste identique (pas de divulgation).
      if ((user as { status?: string }).status !== "ACTIVE") return;
      await sendTransactionalEmail(user, "PASSWORD_RESET", url);
    },
  },
  session: {
    // Inactivité : la session est prolongée à l'usage et expire après 2 h sans activité.
    expiresIn: SESSION_IDLE_SECONDS,
    updateAge: 5 * 60,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "rateLimit",
    // Garde-fou par adresse IP contre les rafales ; le verrou par compte est dans les hooks.
    // Seuils larges : plusieurs utilisateurs peuvent partager une même IP (réseau d'entreprise).
    customRules: {
      "/sign-in/email": { window: 60, max: 20 },
      "/request-password-reset": { window: 15 * 60, max: 10 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-in/email") {
        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof email === "string") await assertNotLocked(normalizeEmail(email));
        return;
      }
      // Même politique de mot de passe que le reste de l'application (lettre + chiffre).
      if (!PASSWORD_ROUTES.includes(ctx.path)) return;
      const body = (ctx.body ?? {}) as { password?: string; newPassword?: string };
      const candidate = body.newPassword ?? body.password;
      if (candidate === undefined) return;
      const check = zPassword.safeParse(candidate);
      if (!check.success) throw new APIError("BAD_REQUEST", { message: check.error.issues[0]!.message });
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const email = (ctx.body as { email?: unknown } | undefined)?.email;
      if (typeof email !== "string") return;
      const returned = ctx.context.returned;
      // Seul un identifiant invalide (401) compte comme échec ; un compte suspendu (403) non.
      if (returned instanceof APIError) {
        if (returned.statusCode === 401) await recordLoginFailure(normalizeEmail(email));
      } else {
        await db.delete(loginAttempt).where(eq(loginAttempt.email, normalizeEmail(email)));
      }
    }),
  },
  databaseHooks: {
    session: {
      create: {
        // Seuls les comptes actifs ouvrent une session (jamais PENDING_ACTIVATION ni SUSPENDED).
        before: async (session) => {
          const [u] = await db.select({ status: schema.user.status }).from(schema.user).where(eq(schema.user.id, session.userId));
          if (u?.status === "PENDING_ACTIVATION") {
            throw new APIError("FORBIDDEN", { message: "Votre compte n’est pas encore activé. Utilisez le lien reçu par e-mail." });
          }
          if (u?.status === "SUSPENDED") {
            throw new APIError("FORBIDDEN", { message: "Votre compte est suspendu. Contactez l’administrateur." });
          }
        },
        after: async (session) => {
          await db.update(schema.user).set({ lastLoginAt: new Date() }).where(eq(schema.user.id, session.userId));
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
