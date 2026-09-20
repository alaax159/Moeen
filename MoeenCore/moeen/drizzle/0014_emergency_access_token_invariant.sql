CREATE TABLE IF NOT EXISTS "emergency_access" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" varchar(64),
	"enabled" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "emergency_access_enabled_token_hash_check" CHECK ("emergency_access"."enabled" = ("emergency_access"."token_hash" IS NOT NULL))
);
--> statement-breakpoint
UPDATE "emergency_access" SET "token_hash" = NULL WHERE "enabled" = false AND "token_hash" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "emergency_access" DROP CONSTRAINT IF EXISTS "emergency_access_enabled_token_hash_check";--> statement-breakpoint
ALTER TABLE "emergency_access" ADD CONSTRAINT "emergency_access_enabled_token_hash_check" CHECK ("emergency_access"."enabled" = ("emergency_access"."token_hash" IS NOT NULL));--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "emergency_access" ADD CONSTRAINT "emergency_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_access_user_id_idx" ON "emergency_access" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_access_token_hash_idx" ON "emergency_access" USING btree ("token_hash");
