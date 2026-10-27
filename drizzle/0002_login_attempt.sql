CREATE TABLE "login_attempt" (
	"email" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_failure_at" timestamp with time zone
);
