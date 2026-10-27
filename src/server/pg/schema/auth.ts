/**
 * Tables BetterAuth (user, session, account, verification), étendues avec les champs métier.
 * `user.name` porte le nom complet ; le rôle et le statut pilotent les autorisations (PRD §9).
 */
import { bigint, boolean, index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["ADMIN", "COACH", "LEARNER"]);
export const userStatusEnum = pgEnum("user_status", ["PENDING_ACTIVATION", "ACTIVE", "SUSPENDED"]);

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(), // normalisé (minuscules, sans espaces)
  emailVerified: boolean().notNull().default(false),
  image: text(),
  role: roleEnum().notNull().default("LEARNER"),
  status: userStatusEnum().notNull().default("PENDING_ACTIVATION"),
  phone: text(),
  lastLoginAt: ts("last_login_at"),
  isDemo: boolean().notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text(),
    password: text(), // hash géré par BetterAuth (jamais exposé)
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

/** Jetons à usage unique (activation, réinitialisation) gérés par BetterAuth. */
export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Limitation de débit de BetterAuth (anti-bruteforce sur la connexion), partagée entre instances. */
export const rateLimit = pgTable("rate_limit", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/** Échecs de connexion par adresse e-mail (existante ou non) : verrou de 15 min après 5 échecs. */
export const loginAttempt = pgTable("login_attempt", {
  email: text().primaryKey(),
  failures: integer().notNull().default(0),
  lockedUntil: ts("locked_until"),
  lastFailureAt: ts("last_failure_at"),
});
