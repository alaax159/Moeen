CREATE TYPE "public"."medication_safety_warning_type" AS ENUM('drug_drug', 'drug_allergy', 'drug_condition');--> statement-breakpoint
CREATE TABLE "medication_safety_warnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_medication_id" integer NOT NULL,
	"warning_type" "medication_safety_warning_type" NOT NULL,
	"severity" varchar(50) NOT NULL,
	"message" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "medication_safety_warnings" ADD CONSTRAINT "medication_safety_warnings_user_medication_id_user_medication_id_fk" FOREIGN KEY ("user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "medication_safety_warnings_medication_active_idx" ON "medication_safety_warnings" USING btree ("user_medication_id","is_active");
