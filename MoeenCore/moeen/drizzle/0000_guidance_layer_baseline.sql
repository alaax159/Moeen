CREATE TYPE "public"."audit_trigger" AS ENUM('patient_chat', 'missed_dose_job', 'explain_finding_request');--> statement-breakpoint
CREATE TYPE "public"."redaction_status" AS ENUM('ok', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."chat_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."dose_log_status" AS ENUM('taken', 'skipped', 'pending', 'snoozed', 'missed');--> statement-breakpoint
CREATE TYPE "public"."guidance_call_status" AS ENUM('success', 'timeout', 'error', 'rate_limited', 'circuit_open');--> statement-breakpoint
CREATE TYPE "public"."guidance_intent" AS ENUM('missed_dose', 'explain_finding', 'medication_question');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('accepted', 'rejected_fallback');--> statement-breakpoint
CREATE TYPE "public"."blood_type" AS ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."health_knowledge_status" AS ENUM('unknown', 'none_known', 'has_records');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('verified', 'non-verified');--> statement-breakpoint
CREATE TYPE "public"."user_medication_completion" AS ENUM('ongoing', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_medication_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('android', 'ios', 'emulator');--> statement-breakpoint
CREATE TYPE "public"."label_fetch_status" AS ENUM('pending', 'fetched', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TABLE "allergy_concepts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"external_id" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chronic_condition_concepts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"external_id" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_allergies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"allergy_concept_id" integer NOT NULL,
	"reaction" varchar(255),
	"severity" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_chronic_conditions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"condition_concept_id" integer NOT NULL,
	"diagnosis_date" date,
	"notes" varchar(1000),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"intent" "guidance_intent" NOT NULL,
	"trigger" "audit_trigger" NOT NULL,
	"prompt_version" varchar(100),
	"retrieved_citation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"redaction_status" "redaction_status" NOT NULL,
	"validation_status" "validation_status",
	"tokens_in" integer,
	"tokens_out" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_session_id" integer NOT NULL,
	"role" "chat_message_role" NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation_status" "validation_status",
	"prompt_version" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dose_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_medication_id" integer NOT NULL,
	"schedule_time_id" integer,
	"date" date NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"status" "dose_log_status" NOT NULL,
	"notified_at" timestamp,
	"marked_at" timestamp DEFAULT now() NOT NULL,
	"snooze_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guidance_call" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"intent" "guidance_intent" NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"latency_ms" integer NOT NULL,
	"status" "guidance_call_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guidance_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_time_id" integer,
	"date" date NOT NULL,
	"text" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation_status" "validation_status" NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date_of_birth" date,
	"weight_kg" numeric(5, 2),
	"height_cm" numeric(5, 2),
	"gender" "gender",
	"blood_type" "blood_type",
	"emergency_contact_phone" varchar(20),
	"doctor_name" varchar(100),
	"doctor_phone" varchar(20),
	"allergy_knowledge_status" "health_knowledge_status" DEFAULT 'unknown' NOT NULL,
	"condition_knowledge_status" "health_knowledge_status" DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_name" varchar(255),
	"generic_name" varchar(255),
	"verified" "verification_status" DEFAULT 'non-verified' NOT NULL,
	"dailymed_id" varchar(255),
	"description" varchar(1000),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_medication" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"medication_id" integer NOT NULL,
	"frequency" integer NOT NULL,
	"dosage_amount" numeric(10, 2) NOT NULL,
	"dosage_unit" varchar(50) NOT NULL,
	"dosage_form" varchar(50) NOT NULL,
	"instructions" text,
	"status" "user_medication_status" DEFAULT 'active' NOT NULL,
	"completion" "user_medication_completion" DEFAULT 'ongoing' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_time" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_medication_id" integer NOT NULL,
	"time" time NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"firebase_uid" varchar(128) NOT NULL,
	"email" varchar(320),
	"first_name" varchar(100),
	"last_name" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expo_push_token" varchar(255) NOT NULL,
	"device_type" "device_type" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"follow_up_enabled" boolean DEFAULT false NOT NULL,
	"follow_up_delay_min" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_prefs_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "label_document" (
	"id" serial PRIMARY KEY NOT NULL,
	"medication_id" integer NOT NULL,
	"set_id" varchar(255) NOT NULL,
	"label_version" varchar(50) NOT NULL,
	"fetch_status" "label_fetch_status" DEFAULT 'pending' NOT NULL,
	"raw_content" text,
	"failure_reason" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_allergies" ADD CONSTRAINT "user_allergies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_allergies" ADD CONSTRAINT "user_allergies_allergy_concept_id_allergy_concepts_id_fk" FOREIGN KEY ("allergy_concept_id") REFERENCES "public"."allergy_concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_chronic_conditions" ADD CONSTRAINT "user_chronic_conditions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_chronic_conditions" ADD CONSTRAINT "user_chronic_conditions_condition_concept_id_chronic_condition_concepts_id_fk" FOREIGN KEY ("condition_concept_id") REFERENCES "public"."chronic_condition_concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_chat_session_id_chat_session_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_session" ADD CONSTRAINT "chat_session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_log" ADD CONSTRAINT "dose_log_user_medication_id_user_medication_id_fk" FOREIGN KEY ("user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_log" ADD CONSTRAINT "dose_log_schedule_time_id_schedule_time_id_fk" FOREIGN KEY ("schedule_time_id") REFERENCES "public"."schedule_time"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guidance_call" ADD CONSTRAINT "guidance_call_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guidance_message" ADD CONSTRAINT "guidance_message_schedule_time_id_schedule_time_id_fk" FOREIGN KEY ("schedule_time_id") REFERENCES "public"."schedule_time"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_profiles" ADD CONSTRAINT "health_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_medication" ADD CONSTRAINT "user_medication_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_medication" ADD CONSTRAINT "user_medication_medication_id_medication_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medication"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_time" ADD CONSTRAINT "schedule_time_user_medication_id_user_medication_id_fk" FOREIGN KEY ("user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_document" ADD CONSTRAINT "label_document_medication_id_medication_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allergy_concepts_name_idx" ON "allergy_concepts" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "allergy_concepts_external_id_idx" ON "allergy_concepts" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chronic_condition_concepts_name_idx" ON "chronic_condition_concepts" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "chronic_condition_concepts_external_id_idx" ON "chronic_condition_concepts" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_allergies_user_concept_idx" ON "user_allergies" USING btree ("user_id","allergy_concept_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_conditions_user_concept_idx" ON "user_chronic_conditions" USING btree ("user_id","condition_concept_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dose_log_schedule_time_id_date_idx" ON "dose_log" USING btree ("schedule_time_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "guidance_message_schedule_time_id_date_idx" ON "guidance_message" USING btree ("schedule_time_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "health_profiles_user_id_idx" ON "health_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "medication_dailymed_id_idx" ON "medication" USING btree ("dailymed_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_time_user_medication_id_time_idx" ON "schedule_time" USING btree ("user_medication_id","time");--> statement-breakpoint
CREATE UNIQUE INDEX "users_firebase_uid_idx" ON "users" USING btree ("firebase_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "user_devices_expo_push_token_idx" ON "user_devices" USING btree ("expo_push_token");--> statement-breakpoint
CREATE UNIQUE INDEX "label_document_set_id_version_idx" ON "label_document" USING btree ("set_id","label_version");