/**
 * Modèle métier (PRD §12, docs/ARCHITECTURE.md §4). Les contraintes que la façade appliquait
 * en mémoire sont ici portées par la base : unicités, index partiels, clés étrangères.
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ServiceCalendar } from "@/modules/core/types";
import { user } from "./auth";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();
const uid = (name: string) => text(name).references(() => user.id);

export const assignmentStatusEnum = pgEnum("assignment_status", ["ACTIVE", "ENDED"]);
export const entitlementStatusEnum = pgEnum("entitlement_status", ["ACTIVE", "SUSPENDED", "EXPIRED"]);
export const quotaEntryTypeEnum = pgEnum("quota_entry_type", ["CONSUME", "REFUND", "CORRECTION"]);
export const requestStatusEnum = pgEnum("request_status", [
  "DRAFT",
  "SUBMITTED",
  "WAITING_FOR_COACH",
  "IN_PROGRESS",
  "WAITING_FOR_LEARNER",
  "RESPONSE_PROVIDED",
  "CLOSED",
  "CANCELLED",
]);
export const priorityEnum = pgEnum("priority", ["NORMAL", "HIGH", "URGENT"]);
export const messageKindEnum = pgEnum("message_kind", ["USER", "SYSTEM"]);
export const messageIntentEnum = pgEnum("message_intent", ["MESSAGE", "CLARIFICATION_REQUEST", "FINAL_RESPONSE"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "REQUEST_SUBMITTED",
  "REQUEST_ASSIGNED",
  "NEW_MESSAGE",
  "CLARIFICATION_REQUESTED",
  "COACH_RESPONSE",
  "REQUEST_CLOSED",
  "RATING_AVAILABLE",
  "RATING_RECEIVED",
  "DEADLINE_REMINDER",
  "REQUEST_OVERDUE",
  "ESCALATION",
  "REASSIGNMENT",
  "REQUEST_REOPENED",
  "NOTIFICATION_FAILURE",
  "COACH_UNAVAILABLE",
  "ACCOUNT",
]);
export const emailStatusEnum = pgEnum("email_status", ["PENDING", "RETRY", "SENT", "FAILED"]);

/* ----------------------------- Coachs et affectations ----------------------------- */

export const coachProfile = pgTable("coach_profile", {
  coachId: text("coach_id").primaryKey().references(() => user.id),
  bio: text().notNull().default(""),
  specialties: text().array().notNull().default(sql`'{}'::text[]`),
  updatedAt: updated(),
});

export const coachAssignment = pgTable(
  "coach_assignment",
  {
    id: text().primaryKey(),
    learnerId: text("learner_id").notNull().references(() => user.id),
    coachId: text("coach_id").notNull().references(() => user.id),
    assignedBy: text("assigned_by").notNull().references(() => user.id),
    startedAt: ts("started_at").notNull(),
    endedAt: ts("ended_at"),
    endedBy: uid("ended_by"),
    status: assignmentStatusEnum().notNull().default("ACTIVE"),
    reason: text(),
    endReason: text("end_reason"),
    createdAt: created(),
  },
  (t) => [
    // Au plus une affectation principale active par apprenant.
    uniqueIndex("coach_assignment_one_active").on(t.learnerId).where(sql`${t.status} = 'ACTIVE'`),
    index("coach_assignment_coach_idx").on(t.coachId),
  ],
);

export const coachAvailability = pgTable(
  "coach_availability",
  {
    id: text().primaryKey(),
    coachId: text("coach_id").notNull().references(() => user.id),
    dayOfWeek: smallint("day_of_week").notNull(), // 1 = lundi … 7 = dimanche (ISO)
    startTime: text("start_time").notNull(), // "HH:MM"
    endTime: text("end_time").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("coach_availability_coach_idx").on(t.coachId)],
);

export const coachAbsence = pgTable(
  "coach_absence",
  {
    id: text().primaryKey(),
    coachId: text("coach_id").notNull().references(() => user.id),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    reason: text(),
    createdAt: created(),
    cancelledAt: ts("cancelled_at"),
  },
  (t) => [index("coach_absence_coach_idx").on(t.coachId)],
);

/* ----------------------------- Droits et quota ----------------------------- */

export const coachingEntitlement = pgTable(
  "coaching_entitlement",
  {
    id: text().primaryKey(),
    learnerId: text("learner_id").notNull().references(() => user.id),
    status: entitlementStatusEnum().notNull().default("ACTIVE"),
    startsAt: ts("starts_at").notNull(),
    expiresAt: ts("expires_at"),
    quotaEnabled: boolean("quota_enabled").notNull().default(false),
    quotaLimit: integer("quota_limit"),
    supersededAt: ts("superseded_at"),
    createdBy: text("created_by").notNull().references(() => user.id),
    updatedBy: text("updated_by").notNull().references(() => user.id),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("entitlement_learner_idx").on(t.learnerId),
    // Au plus un droit en vigueur (non remplacé) par apprenant.
    uniqueIndex("entitlement_one_current").on(t.learnerId).where(sql`${t.supersededAt} is null`),
  ],
);

/** Solde = quota_limit + Σ quantity (CONSUME = -1, REFUND = +n, CORRECTION = ±n). */
export const coachingQuotaLedger = pgTable(
  "coaching_quota_ledger",
  {
    id: text().primaryKey(),
    learnerId: text("learner_id").notNull().references(() => user.id),
    entitlementId: text("entitlement_id").notNull().references(() => coachingEntitlement.id),
    requestId: text("request_id"),
    entryType: quotaEntryTypeEnum("entry_type").notNull(),
    quantity: integer().notNull(),
    reason: text(),
    createdBy: text("created_by").notNull().references(() => user.id),
    createdAt: created(),
    idempotencyKey: text("idempotency_key"),
  },
  (t) => [
    uniqueIndex("quota_ledger_idempotency").on(t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    index("quota_ledger_entitlement_idx").on(t.entitlementId),
  ],
);

/* ----------------------------- Demandes de coaching ----------------------------- */

export const coachingCategory = pgTable("coaching_category", {
  id: text().primaryKey(),
  name: text().notNull(),
  description: text().notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: created(),
  updatedAt: updated(),
});

export const serviceCalendar = pgTable("service_calendar", {
  id: text().primaryKey(),
  name: text().notNull(),
  timezone: text().notNull(),
  workingDays: smallint("working_days").array().notNull(), // ISO 1..7
  periods: jsonb().$type<ServiceCalendar["periods"]>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});

export const serviceHoliday = pgTable(
  "service_holiday",
  {
    id: text().primaryKey(),
    calendarId: text("calendar_id").notNull().references(() => serviceCalendar.id),
    holidayDate: text("holiday_date").notNull(), // "AAAA-MM-JJ" dans le fuseau du calendrier
    label: text().notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("service_holiday_unique").on(t.calendarId, t.holidayDate)],
);

/** Politique versionnée : une nouvelle ligne à chaque modification. */
export const servicePolicy = pgTable("service_policy", {
  id: text().primaryKey(),
  calendarId: text("calendar_id").notNull().references(() => serviceCalendar.id),
  responseTargetWorkingMinutes: integer("response_target_working_minutes").notNull(),
  reminder50Enabled: boolean("reminder_50_enabled").notNull().default(true),
  reminder75Enabled: boolean("reminder_75_enabled").notNull().default(true),
  overdueEscalationWorkingMinutes: integer("overdue_escalation_working_minutes").notNull(),
  calendarSnapshot: jsonb("calendar_snapshot")
    .$type<Pick<ServiceCalendar, "timezone" | "working_days" | "periods">>()
    .notNull(),
  effectiveFrom: ts("effective_from").notNull(),
  createdBy: uid("created_by"),
  createdAt: created(),
});

export const coachingRequest = pgTable(
  "coaching_request",
  {
    id: text().primaryKey(),
    reference: text(), // COA-AAAA-NNNNNN, attribuée à la soumission
    learnerId: text("learner_id").notNull().references(() => user.id),
    coachId: uid("coach_id"),
    categoryId: text("category_id").notNull().references(() => coachingCategory.id),
    subject: text().notNull(),
    description: text().notNull(),
    priority: priorityEnum().notNull().default("NORMAL"),
    status: requestStatusEnum().notNull().default("DRAFT"),
    submittedAt: ts("submitted_at"),
    firstResponseAt: ts("first_response_at"),
    dueAt: ts("due_at"),
    closedAt: ts("closed_at"),
    currentCycleNumber: integer("current_cycle_number").notNull().default(0),
    submitIdempotencyKey: text("submit_idempotency_key"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("coaching_request_reference").on(t.reference).where(sql`${t.reference} is not null`),
    uniqueIndex("coaching_request_submit_key")
      .on(t.learnerId, t.submitIdempotencyKey)
      .where(sql`${t.submitIdempotencyKey} is not null`),
    index("coaching_request_learner_idx").on(t.learnerId),
    index("coaching_request_coach_status_idx").on(t.coachId, t.status),
    index("coaching_request_due_idx").on(t.dueAt),
  ],
);

export const coachingRequestCycle = pgTable(
  "coaching_request_cycle",
  {
    id: text().primaryKey(),
    requestId: text("request_id").notNull().references(() => coachingRequest.id),
    cycleNumber: integer("cycle_number").notNull(),
    startedAt: ts("started_at").notNull(),
    closedAt: ts("closed_at"),
    closedBy: uid("closed_by"),
    assignedCoachId: uid("assigned_coach_id"),
    firstResponseAt: ts("first_response_at"),
    firstResponseBy: uid("first_response_by"),
    dueAt: ts("due_at").notNull(),
    policyId: text("policy_id").notNull().references(() => servicePolicy.id),
    reopenedBy: uid("reopened_by"),
    reopenReason: text("reopen_reason"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("request_cycle_unique").on(t.requestId, t.cycleNumber)],
);

export const coachingMessage = pgTable(
  "coaching_message",
  {
    id: text().primaryKey(),
    requestId: text("request_id").notNull().references(() => coachingRequest.id),
    cycleId: text("cycle_id").notNull().references(() => coachingRequestCycle.id),
    senderId: uid("sender_id"), // null pour un message système
    kind: messageKindEnum().notNull().default("USER"),
    intent: messageIntentEnum().notNull().default("MESSAGE"),
    body: text().notNull(),
    createdAt: created(),
    // Ordre d'insertion : départage les événements d'une même transaction (même horodatage).
    seq: bigserial({ mode: "number" }).notNull(),
  },
  (t) => [index("coaching_message_request_idx").on(t.requestId, t.createdAt)],
);

export const messageAttachment = pgTable(
  "message_attachment",
  {
    id: text().primaryKey(),
    messageId: text("message_id").references(() => coachingMessage.id), // null = description initiale
    requestId: text("request_id").notNull().references(() => coachingRequest.id),
    uploadedBy: text("uploaded_by").notNull().references(() => user.id),
    originalFilename: text("original_filename").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: created(),
  },
  (t) => [index("message_attachment_request_idx").on(t.requestId)],
);

export const requestRead = pgTable(
  "request_read",
  {
    requestId: text("request_id").notNull().references(() => coachingRequest.id),
    userId: text("user_id").notNull().references(() => user.id),
    lastReadAt: ts("last_read_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.userId] })],
);

/** Notes internes : jamais renvoyées à un apprenant. */
export const coachingNote = pgTable(
  "coaching_note",
  {
    id: text().primaryKey(),
    requestId: text("request_id").notNull().references(() => coachingRequest.id),
    authorId: text("author_id").notNull().references(() => user.id),
    body: text().notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("coaching_note_request_idx").on(t.requestId)],
);

export const requestStatusHistory = pgTable(
  "request_status_history",
  {
    id: text().primaryKey(),
    requestId: text("request_id").notNull().references(() => coachingRequest.id),
    cycleId: text("cycle_id").references(() => coachingRequestCycle.id),
    oldStatus: requestStatusEnum("old_status"),
    newStatus: requestStatusEnum("new_status").notNull(),
    changedBy: uid("changed_by"), // null = système
    reason: text(),
    createdAt: created(),
    seq: bigserial({ mode: "number" }).notNull(),
  },
  (t) => [index("request_status_history_request_idx").on(t.requestId)],
);

export const requestAssignmentHistory = pgTable(
  "request_assignment_history",
  {
    id: text().primaryKey(),
    requestId: text("request_id").notNull().references(() => coachingRequest.id),
    cycleId: text("cycle_id").references(() => coachingRequestCycle.id),
    oldCoachId: uid("old_coach_id"),
    newCoachId: text("new_coach_id").notNull().references(() => user.id),
    changedBy: text("changed_by").notNull().references(() => user.id),
    reason: text().notNull(),
    createdAt: created(),
  },
  (t) => [index("request_assignment_history_request_idx").on(t.requestId)],
);

export const coachingRating = pgTable(
  "coaching_rating",
  {
    id: text().primaryKey(),
    requestId: text("request_id").notNull().references(() => coachingRequest.id),
    cycleId: text("cycle_id").notNull().references(() => coachingRequestCycle.id),
    cycleNumber: integer("cycle_number").notNull(),
    learnerId: text("learner_id").notNull().references(() => user.id),
    coachId: text("coach_id").notNull().references(() => user.id),
    score: smallint().notNull(),
    comment: text(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("coaching_rating_unique").on(t.requestId, t.cycleId)],
);

/* ----------------------------- Notifications et e-mails ----------------------------- */

/** Clé d'événement unique : garantit l'anti-doublon des notifications. */
export const notificationEvent = pgTable("notification_event", {
  key: text().primaryKey(),
  createdAt: created(),
});

export const notification = pgTable(
  "notification",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull().references(() => user.id),
    type: notificationTypeEnum().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    relatedRequestId: text("related_request_id").references(() => coachingRequest.id),
    eventKey: text("event_key").notNull(),
    readAt: ts("read_at"),
    createdAt: created(),
  },
  (t) => [index("notification_user_idx").on(t.userId, t.createdAt)],
);

export const emailDeliveryLog = pgTable(
  "email_delivery_log",
  {
    id: text().primaryKey(),
    notificationId: text("notification_id").references(() => notification.id),
    recipient: text().notNull(),
    templateKey: text("template_key").notNull(),
    templateParams: jsonb("template_params").$type<Record<string, string>>().notNull().default({}),
    status: emailStatusEnum().notNull().default("PENDING"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: ts("last_attempt_at"),
    nextAttemptAt: ts("next_attempt_at"),
    sentAt: ts("sent_at"),
    errorCode: text("error_code"),
    createdAt: created(),
  },
  (t) => [index("email_delivery_pending_idx").on(t.status, t.nextAttemptAt)],
);

/* ----------------------------- Administration ----------------------------- */

/** Paramètres applicatifs : une seule ligne (id = 'app'). */
export const appSettings = pgTable("app_settings", {
  id: text().primaryKey().default("app"),
  attachmentMaxSizeBytes: integer("attachment_max_size_bytes").notNull().default(5 * 1024 * 1024),
  attachmentAllowedExtensions: text("attachment_allowed_extensions")
    .array()
    .notNull()
    .default(sql`'{pdf,png,jpg,jpeg,txt,csv,docx,xlsx}'::text[]`),
  attachmentMaxFilesPerMessage: integer("attachment_max_files_per_message").notNull().default(5),
  learnerCanClose: boolean("learner_can_close").notNull().default(false),
  learnerFollowUpReopensProcessing: boolean("learner_follow_up_reopens_processing").notNull().default(true),
  coachCanViewRatings: boolean("coach_can_view_ratings").notNull().default(true),
  emailMaxAttempts: integer("email_max_attempts").notNull().default(4),
  updatedAt: updated(),
  updatedBy: uid("updated_by"),
});

/** Compteurs nommés (ex. référence annuelle des demandes), incrémentés en transaction. */
export const sequence = pgTable("sequence", {
  name: text().primaryKey(),
  value: integer().notNull().default(0),
});

/** Journal d'audit : append-only, lecture admin uniquement. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text().primaryKey(),
    actorId: uid("actor_id"),
    action: text().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    reason: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId), index("audit_log_created_idx").on(t.createdAt)],
);

export const jobRun = pgTable("job_run", {
  id: text().primaryKey(),
  job: text().notNull(),
  startedAt: ts("started_at").notNull(),
  finishedAt: ts("finished_at").notNull(),
  ok: boolean().notNull(),
  summary: text().notNull(),
  error: text(),
});
