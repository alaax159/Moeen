CREATE TYPE "public"."medication_safety_check_status" AS ENUM('checked', 'failed');--> statement-breakpoint
CREATE TABLE "medication_safety_check" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_medication_id" integer NOT NULL,
	"status" "medication_safety_check_status" NOT NULL,
	"checked_at" timestamp,
	CONSTRAINT "medication_safety_check_user_medication_id_unique" UNIQUE("user_medication_id")
);
--> statement-breakpoint
ALTER TABLE "medication_safety_check" ADD CONSTRAINT "medication_safety_check_user_medication_id_user_medication_id_fk" FOREIGN KEY ("user_medication_id") REFERENCES "public"."user_medication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "medication_safety_check" ("user_medication_id", "status", "checked_at")
SELECT "user_medication_id", 'checked', MAX("checked_at")
FROM "medication_safety_warnings"
GROUP BY "user_medication_id"
ON CONFLICT DO NOTHING;