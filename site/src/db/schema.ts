/** Modèle de données du site (§6.4). Montants en FCFA entiers ; limites nulles = illimité. */
import { sql } from "drizzle-orm";
import { bigint, boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const id = () => uuid().primaryKey().defaultRandom();
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();

export const CLIENT_STATUSES = ["ESSAI", "ACTIF", "IMPAYE", "SUSPENDU", "RESILIE"] as const;
export const PROSPECT_STATUSES = ["NOUVEAU", "CONTACTE", "CONVERTI", "PERDU"] as const;
export const BILLING_PERIODS = ["MONTHLY", "ANNUAL"] as const;

export const clientStatusEnum = pgEnum("client_status", CLIENT_STATUSES);
export const prospectStatusEnum = pgEnum("prospect_status", PROSPECT_STATUSES);
export const billingPeriodEnum = pgEnum("billing_period", BILLING_PERIODS);

export const plan = pgTable("plan", {
  id: id(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text().notNull().default(""),
  monthlyPrice: integer("monthly_price"),
  annualPrice: integer("annual_price"),
  annualDiscountPercent: integer("annual_discount_percent").notNull().default(0),
  maxCoaches: integer("max_coaches"),
  maxMembers: integer("max_members"),
  trialDays: integer("trial_days").notNull().default(30),
  features: text().array().notNull().default(sql`'{}'::text[]`),
  position: integer().notNull().default(0),
  highlighted: boolean().notNull().default(false),
  published: boolean().notNull().default(false),
  createdAt: created(),
  updatedAt: updated(),
});

export const client = pgTable("client", {
  id: id(),
  name: text().notNull(),
  contactName: text("contact_name").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone"),
  /** Sous-domaine de l'instance (ex. `acme` pour acme.<INSTANCE_DOMAIN>). */
  instanceHost: text("instance_host").unique(),
  planId: uuid("plan_id").references(() => plan.id),
  billingPeriod: billingPeriodEnum("billing_period").notNull().default("MONTHLY"),
  status: clientStatusEnum().notNull().default("ESSAI"),
  trialEndsOn: date("trial_ends_on", { mode: "string" }),
  nextDueOn: date("next_due_on", { mode: "string" }),
  /** Clé d'accès `ops` de l'instance, chiffrée (jamais en clair). */
  keyEncrypted: text("key_encrypted"),
  notes: text().notNull().default(""),
  createdAt: created(),
  updatedAt: updated(),
});

export const payment = pgTable("payment", {
  id: id(),
  clientId: uuid("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
  paidOn: date("paid_on", { mode: "string" }).notNull(),
  amount: integer().notNull(),
  method: text().notNull().default(""),
  periodStart: date("period_start", { mode: "string" }),
  periodEnd: date("period_end", { mode: "string" }),
  note: text().notNull().default(""),
  createdAt: created(),
});

export const prospect = pgTable(
  "prospect",
  {
    id: id(),
    name: text().notNull(),
    email: text().notNull(),
    emailNormalized: text("email_normalized").notNull(),
    phone: text(),
    activity: text().notNull().default(""),
    message: text().notNull().default(""),
    consent: boolean().notNull(),
    status: prospectStatusEnum().notNull().default("NOUVEAU"),
    clientId: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("prospect_email_normalized_uq").on(t.emailNormalized)],
);

export const healthCheck = pgTable(
  "health_check",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
    checkedAt: ts("checked_at").notNull().defaultNow(),
    ok: boolean().notNull(),
    latencyMs: integer("latency_ms").notNull(),
    httpStatus: integer("http_status"),
    version: text(),
  },
  (t) => [index("health_check_client_date_idx").on(t.clientId, t.checkedAt)],
);

export const usageSnapshot = pgTable(
  "usage_snapshot",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => client.id, { onDelete: "cascade" }),
    day: date({ mode: "string" }).notNull(),
    counters: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("usage_snapshot_client_day_uq").on(t.clientId, t.day)],
);

export const auditLog = pgTable("audit_log", {
  id: id(),
  action: text().notNull(),
  target: text(),
  createdAt: created(),
});

export type Plan = typeof plan.$inferSelect;
export type Client = typeof client.$inferSelect;
export type Prospect = typeof prospect.$inferSelect;

// --- Authentification de l'opérateur (BetterAuth + double authentification) ---
export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: created(),
  updatedAt: updated(),
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
    createdAt: created(),
    updatedAt: updated(),
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
    password: text(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text().primaryKey(),
    secret: text().notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    verified: boolean().notNull().default(true),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: ts("locked_until"),
  },
  (t) => [index("two_factor_user_idx").on(t.userId), index("two_factor_secret_idx").on(t.secret)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/** Échecs de connexion par adresse : verrou de 15 minutes après 5 échecs. */
export const loginAttempt = pgTable("login_attempt", {
  email: text().primaryKey(),
  failures: integer().notNull().default(0),
  lockedUntil: ts("locked_until"),
  lastFailureAt: ts("last_failure_at"),
});
