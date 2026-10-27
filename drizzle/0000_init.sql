CREATE TYPE "public"."role" AS ENUM('ADMIN', 'COACH', 'LEARNER');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('ACTIVE', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('PENDING', 'RETRY', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."entitlement_status" AS ENUM('ACTIVE', 'SUSPENDED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."message_intent" AS ENUM('MESSAGE', 'CLARIFICATION_REQUEST', 'FINAL_RESPONSE');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('USER', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('REQUEST_SUBMITTED', 'REQUEST_ASSIGNED', 'NEW_MESSAGE', 'CLARIFICATION_REQUESTED', 'COACH_RESPONSE', 'REQUEST_CLOSED', 'RATING_AVAILABLE', 'RATING_RECEIVED', 'DEADLINE_REMINDER', 'REQUEST_OVERDUE', 'ESCALATION', 'REASSIGNMENT', 'REQUEST_REOPENED', 'NOTIFICATION_FAILURE', 'COACH_UNAVAILABLE', 'ACCOUNT');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('NORMAL', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."quota_entry_type" AS ENUM('CONSUME', 'REFUND', 'CORRECTION');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('DRAFT', 'SUBMITTED', 'WAITING_FOR_COACH', 'IN_PROGRESS', 'WAITING_FOR_LEARNER', 'RESPONSE_PROVIDED', 'CLOSED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "role" DEFAULT 'LEARNER' NOT NULL,
	"status" "user_status" DEFAULT 'PENDING_ACTIVATION' NOT NULL,
	"phone" text,
	"last_login_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY DEFAULT 'app' NOT NULL,
	"attachment_max_size_bytes" integer DEFAULT 5242880 NOT NULL,
	"attachment_allowed_extensions" text[] DEFAULT '{pdf,png,jpg,jpeg,txt,csv,docx,xlsx}'::text[] NOT NULL,
	"attachment_max_files_per_message" integer DEFAULT 5 NOT NULL,
	"learner_can_close" boolean DEFAULT false NOT NULL,
	"learner_follow_up_reopens_processing" boolean DEFAULT true NOT NULL,
	"coach_can_view_ratings" boolean DEFAULT true NOT NULL,
	"email_max_attempts" integer DEFAULT 4 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_absence" (
	"id" text PRIMARY KEY NOT NULL,
	"coach_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "coach_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"coach_id" text NOT NULL,
	"assigned_by" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" text,
	"status" "assignment_status" DEFAULT 'ACTIVE' NOT NULL,
	"reason" text,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_availability" (
	"id" text PRIMARY KEY NOT NULL,
	"coach_id" text NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_profile" (
	"coach_id" text PRIMARY KEY NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"specialties" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_category" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_entitlement" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"status" "entitlement_status" DEFAULT 'ACTIVE' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"quota_enabled" boolean DEFAULT false NOT NULL,
	"quota_limit" integer,
	"superseded_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_message" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"cycle_id" text NOT NULL,
	"sender_id" text,
	"kind" "message_kind" DEFAULT 'USER' NOT NULL,
	"intent" "message_intent" DEFAULT 'MESSAGE' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_note" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_quota_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"learner_id" text NOT NULL,
	"entitlement_id" text NOT NULL,
	"request_id" text,
	"entry_type" "quota_entry_type" NOT NULL,
	"quantity" integer NOT NULL,
	"reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" text
);
--> statement-breakpoint
CREATE TABLE "coaching_rating" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"cycle_id" text NOT NULL,
	"cycle_number" integer NOT NULL,
	"learner_id" text NOT NULL,
	"coach_id" text NOT NULL,
	"score" smallint NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_request" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text,
	"learner_id" text NOT NULL,
	"coach_id" text,
	"category_id" text NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"priority" "priority" DEFAULT 'NORMAL' NOT NULL,
	"status" "request_status" DEFAULT 'DRAFT' NOT NULL,
	"submitted_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"current_cycle_number" integer DEFAULT 0 NOT NULL,
	"submit_idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_request_cycle" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"cycle_number" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"assigned_coach_id" text,
	"first_response_at" timestamp with time zone,
	"first_response_by" text,
	"due_at" timestamp with time zone NOT NULL,
	"policy_id" text NOT NULL,
	"reopened_by" text,
	"reopen_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_delivery_log" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text,
	"recipient" text NOT NULL,
	"template_key" text NOT NULL,
	"template_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "email_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL,
	"summary" text NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "message_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text,
	"request_id" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"original_filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_attachment_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"related_request_id" text,
	"event_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_event" (
	"key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_assignment_history" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"cycle_id" text,
	"old_coach_id" text,
	"new_coach_id" text NOT NULL,
	"changed_by" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_read" (
	"request_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "request_read_request_id_user_id_pk" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "request_status_history" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"cycle_id" text,
	"old_status" "request_status",
	"new_status" "request_status" NOT NULL,
	"changed_by" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence" (
	"name" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_calendar" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"working_days" smallint[] NOT NULL,
	"periods" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_holiday" (
	"id" text PRIMARY KEY NOT NULL,
	"calendar_id" text NOT NULL,
	"holiday_date" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"calendar_id" text NOT NULL,
	"response_target_working_minutes" integer NOT NULL,
	"reminder_50_enabled" boolean DEFAULT true NOT NULL,
	"reminder_75_enabled" boolean DEFAULT true NOT NULL,
	"overdue_escalation_working_minutes" integer NOT NULL,
	"calendar_snapshot" jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_absence" ADD CONSTRAINT "coach_absence_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_assignment" ADD CONSTRAINT "coach_assignment_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_assignment" ADD CONSTRAINT "coach_assignment_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_assignment" ADD CONSTRAINT "coach_assignment_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_assignment" ADD CONSTRAINT "coach_assignment_ended_by_user_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_availability" ADD CONSTRAINT "coach_availability_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_profile" ADD CONSTRAINT "coach_profile_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_entitlement" ADD CONSTRAINT "coaching_entitlement_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_entitlement" ADD CONSTRAINT "coaching_entitlement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_entitlement" ADD CONSTRAINT "coaching_entitlement_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_message" ADD CONSTRAINT "coaching_message_request_id_coaching_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."coaching_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_message" ADD CONSTRAINT "coaching_message_cycle_id_coaching_request_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."coaching_request_cycle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_message" ADD CONSTRAINT "coaching_message_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_note" ADD CONSTRAINT "coaching_note_request_id_coaching_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."coaching_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_note" ADD CONSTRAINT "coaching_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_quota_ledger" ADD CONSTRAINT "coaching_quota_ledger_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_quota_ledger" ADD CONSTRAINT "coaching_quota_ledger_entitlement_id_coaching_entitlement_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."coaching_entitlement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_quota_ledger" ADD CONSTRAINT "coaching_quota_ledger_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_rating" ADD CONSTRAINT "coaching_rating_request_id_coaching_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."coaching_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_rating" ADD CONSTRAINT "coaching_rating_cycle_id_coaching_request_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."coaching_request_cycle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_rating" ADD CONSTRAINT "coaching_rating_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_rating" ADD CONSTRAINT "coaching_rating_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_request" ADD CONSTRAINT "coaching_request_learner_id_user_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_request" ADD CONSTRAINT "coaching_request_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_request" ADD CONSTRAINT "coaching_request_category_id_coaching_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."coaching_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_request_cycle" ADD CONSTRAINT "coaching_request_cycle_request_id_coaching_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."coaching_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_request_cycle" ADD CONSTRAINT "coaching_request_cycle_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_request_cycle" ADD CONSTRAINT "coaching_request_cycle_assigned_coach_id_user_id_fk" FOREIGN KEY ("assigned_coach_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_request_cycle" ADD CONSTRAINT "coaching_request_cycle_first_response_by_user_id_fk" FOREIGN KEY ("first_response_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_request_cycle" ADD CONSTRAINT "coaching_request_cycle_policy_id_service_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."service_policy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_request_cycle" ADD CONSTRAINT "coaching_request_cycle_reopened_by_user_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_log" ADD CONSTRAINT "email_delivery_log_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_message_id_coaching_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."coaching_message"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_request_id_coaching_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."coaching_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_related_request_id_coaching_request_id_fk" FOREIGN KEY ("related_request_id") REFERENCES "public"."coaching_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_assignment_history" ADD CONSTRAINT "request_assignment_history_request_id_coaching_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."coaching_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_assignment_history" ADD CONSTRAINT "request_assignment_history_cycle_id_coaching_request_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."coaching_request_cycle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_assignment_history" ADD CONSTRAINT "request_assignment_history_old_coach_id_user_id_fk" FOREIGN KEY ("old_coach_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_assignment_history" ADD CONSTRAINT "request_assignment_history_new_coach_id_user_id_fk" FOREIGN KEY ("new_coach_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_assignment_history" ADD CONSTRAINT "request_assignment_history_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_read" ADD CONSTRAINT "request_read_request_id_coaching_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."coaching_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_read" ADD CONSTRAINT "request_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_request_id_coaching_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."coaching_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_cycle_id_coaching_request_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."coaching_request_cycle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_holiday" ADD CONSTRAINT "service_holiday_calendar_id_service_calendar_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."service_calendar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_policy" ADD CONSTRAINT "service_policy_calendar_id_service_calendar_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."service_calendar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_policy" ADD CONSTRAINT "service_policy_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "coach_absence_coach_idx" ON "coach_absence" USING btree ("coach_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coach_assignment_one_active" ON "coach_assignment" USING btree ("learner_id") WHERE "coach_assignment"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "coach_assignment_coach_idx" ON "coach_assignment" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "coach_availability_coach_idx" ON "coach_availability" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "entitlement_learner_idx" ON "coaching_entitlement" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "coaching_message_request_idx" ON "coaching_message" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "coaching_note_request_idx" ON "coaching_note" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quota_ledger_idempotency" ON "coaching_quota_ledger" USING btree ("idempotency_key") WHERE "coaching_quota_ledger"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "quota_ledger_entitlement_idx" ON "coaching_quota_ledger" USING btree ("entitlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coaching_rating_unique" ON "coaching_rating" USING btree ("request_id","cycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coaching_request_reference" ON "coaching_request" USING btree ("reference") WHERE "coaching_request"."reference" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "coaching_request_submit_key" ON "coaching_request" USING btree ("learner_id","submit_idempotency_key") WHERE "coaching_request"."submit_idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "coaching_request_learner_idx" ON "coaching_request" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "coaching_request_coach_status_idx" ON "coaching_request" USING btree ("coach_id","status");--> statement-breakpoint
CREATE INDEX "coaching_request_due_idx" ON "coaching_request" USING btree ("due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "request_cycle_unique" ON "coaching_request_cycle" USING btree ("request_id","cycle_number");--> statement-breakpoint
CREATE INDEX "email_delivery_pending_idx" ON "email_delivery_log" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "message_attachment_request_idx" ON "message_attachment" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "request_assignment_history_request_idx" ON "request_assignment_history" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "request_status_history_request_idx" ON "request_status_history" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_holiday_unique" ON "service_holiday" USING btree ("calendar_id","holiday_date");