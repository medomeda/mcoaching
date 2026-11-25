CREATE TYPE "public"."billing_period" AS ENUM('MONTHLY', 'ANNUAL');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('ESSAI', 'ACTIF', 'IMPAYE', 'SUSPENDU', 'RESILIE');--> statement-breakpoint
CREATE TYPE "public"."prospect_status" AS ENUM('NOUVEAU', 'CONTACTE', 'CONVERTI', 'PERDU');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"contact_phone" text,
	"instance_host" text,
	"plan_id" uuid,
	"billing_period" "billing_period" DEFAULT 'MONTHLY' NOT NULL,
	"status" "client_status" DEFAULT 'ESSAI' NOT NULL,
	"trial_ends_on" date,
	"next_due_on" date,
	"key_encrypted" text,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_instance_host_unique" UNIQUE("instance_host")
);
--> statement-breakpoint
CREATE TABLE "health_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"latency_ms" integer NOT NULL,
	"http_status" integer,
	"version" text
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"amount" integer NOT NULL,
	"method" text DEFAULT '' NOT NULL,
	"period_start" date,
	"period_end" date,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"monthly_price" integer,
	"annual_price" integer,
	"annual_discount_percent" integer DEFAULT 0 NOT NULL,
	"max_coaches" integer,
	"max_members" integer,
	"trial_days" integer DEFAULT 30 NOT NULL,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"highlighted" boolean DEFAULT false NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "prospect" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"phone" text,
	"activity" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"consent" boolean NOT NULL,
	"status" "prospect_status" DEFAULT 'NOUVEAU' NOT NULL,
	"client_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"day" date NOT NULL,
	"counters" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_check" ADD CONSTRAINT "health_check_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_snapshot" ADD CONSTRAINT "usage_snapshot_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_check_client_date_idx" ON "health_check" USING btree ("client_id","checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prospect_email_normalized_uq" ON "prospect" USING btree ("email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_snapshot_client_day_uq" ON "usage_snapshot" USING btree ("client_id","day");