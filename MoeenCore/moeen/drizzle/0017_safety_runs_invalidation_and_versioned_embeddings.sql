CREATE TYPE "public"."medication_safety_checker_status" AS ENUM('verified', 'not_applicable', 'partial', 'unavailable', 'failed');--> statement-breakpoint
CREATE TYPE "public"."medication_safety_checker_type" AS ENUM('drug_drug', 'drug_allergy', 'drug_condition', 'duplicate_therapy');--> statement-breakpoint
CREATE TYPE "public"."medication_safety_coverage_status" AS ENUM('complete', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."medication_safety_finding_type" AS ENUM('drug_interaction', 'allergy_conflict', 'condition_caution', 'duplicate_therapy');--> statement-breakpoint
CREATE TYPE "public"."medication_safety_outbox_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."medication_safety_outcome" AS ENUM('clear', 'findings', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."medication_safety_severity" AS ENUM('minor', 'moderate', 'major', 'contraindicated');--> statement-breakpoint
CREATE TYPE "public"."medication_safety_trigger" AS ENUM('medication_added', 'medication_updated', 'medication_precheck', 'active_review', 'dose_missed', 'medication_archived', 'allergy_updated', 'condition_updated', 'knowledge_updated', 'label_updated', 'manual_recheck');--> statement-breakpoint
ALTER TYPE "public"."medication_safety_warning_type" ADD VALUE 'duplicate_therapy';--> statement-breakpoint
CREATE TABLE "medication_safety_checker_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"checker_type" "medication_safety_checker_type" NOT NULL,
	"status" "medication_safety_checker_status" NOT NULL,
	"reason_code" varchar(100),
	"dataset_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_safety_current_check" (
	"user_id" integer NOT NULL,
	"subject_user_medication_id" integer NOT NULL,
	"checker_type" "medication_safety_checker_type" NOT NULL,
	"latest_checker_result_id" uuid NOT NULL,
	"last_complete_checker_result_id" uuid,
	"latest_started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medication_safety_current_check_pk" PRIMARY KEY("subject_user_medication_id","checker_type")
);
--> statement-breakpoint
CREATE TABLE "medication_safety_current_finding" (
	"user_id" integer NOT NULL,
	"subject_user_medication_id" integer NOT NULL,
	"checker_type" "medication_safety_checker_type" NOT NULL,
	"finding_key" varchar(512) NOT NULL,
	"finding_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medication_safety_current_finding_pk" PRIMARY KEY("subject_user_medication_id","checker_type","finding_key")
);
--> statement-breakpoint
CREATE TABLE "medication_safety_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"checker_result_id" uuid NOT NULL,
	"finding_id" uuid,
	"source" varchar(100) NOT NULL,
	"source_record_id" varchar(255),
	"source_version" varchar(255),
	"section" varchar(100),
	"uri" text,
	"content_hash" char(64),
	"details" jsonb,
	"retrieved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_safety_finding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checker_result_id" uuid NOT NULL,
	"finding_type" "medication_safety_finding_type" NOT NULL,
	"severity" "medication_safety_severity" NOT NULL,
	"rationale" text NOT NULL,
	"affected" text,
	"primary_user_medication_id" integer,
	"interacting_user_medication_id" integer,
	"subject_user_allergy_id" integer,
	"subject_user_condition_id" integer,
	"finding_key" varchar(512) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_safety_recheck_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"subject_user_medication_id" integer,
	"trigger" "medication_safety_trigger" NOT NULL,
	"context_version" integer NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "medication_safety_outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_safety_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"subject_user_medication_id" integer,
	"trigger" "medication_safety_trigger" NOT NULL,
	"required_checks" jsonb NOT NULL,
	"outcome" "medication_safety_outcome" NOT NULL,
	"coverage_status" "medication_safety_coverage_status" NOT NULL,
	"engine_version" varchar(100) NOT NULL,
	"dataset_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context_snapshot" jsonb NOT NULL,
	"context_hash" char(64) NOT NULL,
	"context_version" integer DEFAULT 0 NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medication_safety_run_time_order_check" CHECK ("medication_safety_run"."completed_at" >= "medication_safety_run"."started_at"),
	CONSTRAINT "medication_safety_run_clear_coverage_check" CHECK ("medication_safety_run"."outcome" <> 'clear' OR "medication_safety_run"."coverage_status" = 'complete')
);
--> statement-breakpoint
CREATE TABLE "patient_safety_state" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"context_version" integer DEFAULT 0 NOT NULL,
	"invalidation_reason" "medication_safety_trigger",
	"invalidated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "safety_run_id" uuid;--> statement-breakpoint
ALTER TABLE "guidance_message" ADD COLUMN "safety_run_id" uuid;--> statement-breakpoint
--
-- Hand-adjusted from the generated form, which added both columns NOT NULL in
-- one statement. Postgres rejects that outright on any database that already
-- holds label chunks, because the existing rows cannot satisfy the constraint
-- and there is no default to give them. Added nullable, backfilled, then
-- constrained, so this applies to a populated database and not only to a
-- fresh schema.
--
-- The sentinel is deliberate rather than a placeholder. Chunks written before
-- these columns existed were embedded by a provider we can no longer identify,
-- and 'unknown' is a profile no provider ever reports, so: retrieval, which
-- filters on an exact model + version match, cannot compare them against
-- vectors from a different model and simply returns no evidence for them; and
-- the ingestion reconciliation, which re-embeds any document whose chunks
-- carry a profile other than the active one, picks them up on the next pass.
-- Failing closed and then healing is the behaviour ARCHITECTURE.md asks for.
ALTER TABLE "label_chunk" ADD COLUMN "embedding_model" varchar(100);--> statement-breakpoint
ALTER TABLE "label_chunk" ADD COLUMN "embedding_version" varchar(100);--> statement-breakpoint
UPDATE "label_chunk" SET "embedding_model" = 'unknown' WHERE "embedding_model" IS NULL;--> statement-breakpoint
UPDATE "label_chunk" SET "embedding_version" = 'unknown' WHERE "embedding_version" IS NULL;--> statement-breakpoint
ALTER TABLE "label_chunk" ALTER COLUMN "embedding_model" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "label_chunk" ALTER COLUMN "embedding_version" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "medication_safety_checker_result" ADD CONSTRAINT "medication_safety_checker_result_run_id_medication_safety_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."medication_safety_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_current_check" ADD CONSTRAINT "medication_safety_current_check_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_current_check" ADD CONSTRAINT "medication_safety_current_check_subject_user_medication_id_user_medication_id_fk" FOREIGN KEY ("subject_user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_current_check" ADD CONSTRAINT "medication_safety_current_check_latest_checker_result_id_medication_safety_checker_result_id_fk" FOREIGN KEY ("latest_checker_result_id") REFERENCES "public"."medication_safety_checker_result"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_current_check" ADD CONSTRAINT "medication_safety_current_check_last_complete_checker_result_id_medication_safety_checker_result_id_fk" FOREIGN KEY ("last_complete_checker_result_id") REFERENCES "public"."medication_safety_checker_result"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_current_finding" ADD CONSTRAINT "medication_safety_current_finding_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_current_finding" ADD CONSTRAINT "medication_safety_current_finding_subject_user_medication_id_user_medication_id_fk" FOREIGN KEY ("subject_user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_current_finding" ADD CONSTRAINT "medication_safety_current_finding_finding_id_medication_safety_finding_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."medication_safety_finding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_evidence" ADD CONSTRAINT "medication_safety_evidence_checker_result_id_medication_safety_checker_result_id_fk" FOREIGN KEY ("checker_result_id") REFERENCES "public"."medication_safety_checker_result"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_evidence" ADD CONSTRAINT "medication_safety_evidence_finding_id_medication_safety_finding_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."medication_safety_finding"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_finding" ADD CONSTRAINT "medication_safety_finding_checker_result_id_medication_safety_checker_result_id_fk" FOREIGN KEY ("checker_result_id") REFERENCES "public"."medication_safety_checker_result"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_finding" ADD CONSTRAINT "medication_safety_finding_primary_user_medication_id_user_medication_id_fk" FOREIGN KEY ("primary_user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_finding" ADD CONSTRAINT "medication_safety_finding_interacting_user_medication_id_user_medication_id_fk" FOREIGN KEY ("interacting_user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_finding" ADD CONSTRAINT "medication_safety_finding_subject_user_allergy_id_user_allergies_id_fk" FOREIGN KEY ("subject_user_allergy_id") REFERENCES "public"."user_allergies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_finding" ADD CONSTRAINT "medication_safety_finding_subject_user_condition_id_user_chronic_conditions_id_fk" FOREIGN KEY ("subject_user_condition_id") REFERENCES "public"."user_chronic_conditions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_recheck_outbox" ADD CONSTRAINT "medication_safety_recheck_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_recheck_outbox" ADD CONSTRAINT "medication_safety_recheck_outbox_subject_user_medication_id_user_medication_id_fk" FOREIGN KEY ("subject_user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_run" ADD CONSTRAINT "medication_safety_run_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_safety_run" ADD CONSTRAINT "medication_safety_run_subject_user_medication_id_user_medication_id_fk" FOREIGN KEY ("subject_user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_safety_state" ADD CONSTRAINT "patient_safety_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "medication_safety_checker_run_type_idx" ON "medication_safety_checker_result" USING btree ("run_id","checker_type");--> statement-breakpoint
CREATE INDEX "medication_safety_current_check_user_idx" ON "medication_safety_current_check" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "medication_safety_current_finding_id_idx" ON "medication_safety_current_finding" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "medication_safety_current_finding_user_idx" ON "medication_safety_current_finding" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "medication_safety_evidence_finding_idx" ON "medication_safety_evidence" USING btree ("finding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "medication_safety_finding_result_key_idx" ON "medication_safety_finding" USING btree ("checker_result_id","finding_key");--> statement-breakpoint
CREATE INDEX "medication_safety_finding_checker_idx" ON "medication_safety_finding" USING btree ("checker_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX "medication_safety_recheck_outbox_idempotency_idx" ON "medication_safety_recheck_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "medication_safety_recheck_outbox_poll_idx" ON "medication_safety_recheck_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "medication_safety_recheck_outbox_user_version_idx" ON "medication_safety_recheck_outbox" USING btree ("user_id","context_version");--> statement-breakpoint
CREATE UNIQUE INDEX "medication_safety_run_idempotency_idx" ON "medication_safety_run" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "medication_safety_run_user_completed_idx" ON "medication_safety_run" USING btree ("user_id","completed_at");--> statement-breakpoint
CREATE INDEX "medication_safety_run_subject_completed_idx" ON "medication_safety_run" USING btree ("subject_user_medication_id","completed_at");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_safety_run_id_medication_safety_run_id_fk" FOREIGN KEY ("safety_run_id") REFERENCES "public"."medication_safety_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guidance_message" ADD CONSTRAINT "guidance_message_safety_run_id_medication_safety_run_id_fk" FOREIGN KEY ("safety_run_id") REFERENCES "public"."medication_safety_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guidance_message_safety_run_idx" ON "guidance_message" USING btree ("safety_run_id");--> statement-breakpoint
CREATE INDEX "label_chunk_embedding_profile_idx" ON "label_chunk" USING btree ("embedding_model","embedding_version");