CREATE TYPE "public"."emergency_notification_event" AS ENUM('severe_medication_reaction');--> statement-breakpoint
CREATE TYPE "public"."emergency_notification_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TABLE "emergency_notification_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"event" "emergency_notification_event" NOT NULL,
	"status" "emergency_notification_status" NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emergency_notification_log" ADD CONSTRAINT "emergency_notification_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emergency_notification_log_user_id_sent_at_idx" ON "emergency_notification_log" USING btree ("user_id","sent_at");