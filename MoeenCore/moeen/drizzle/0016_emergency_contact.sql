CREATE TABLE "emergency_contact" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"relationship" varchar(50),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emergency_contact" ADD CONSTRAINT "emergency_contact_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emergency_contact_user_id_idx" ON "emergency_contact" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_contact_one_primary_per_user_idx" ON "emergency_contact" USING btree ("user_id") WHERE "emergency_contact"."is_primary";--> statement-breakpoint
INSERT INTO "emergency_contact" ("user_id", "name", "phone", "is_primary")
SELECT "user_id", 'Emergency contact', "emergency_contact_phone", true
FROM "health_profiles"
WHERE "emergency_contact_phone" IS NOT NULL AND "emergency_contact_phone" <> '';