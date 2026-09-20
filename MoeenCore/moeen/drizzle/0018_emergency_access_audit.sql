CREATE TYPE "public"."emergency_access_audit_action" AS ENUM('enabled', 'regenerated', 'disabled');--> statement-breakpoint
CREATE TABLE "emergency_access_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"action" "emergency_access_audit_action" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emergency_access_audit" ADD CONSTRAINT "emergency_access_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emergency_access_audit_user_id_idx" ON "emergency_access_audit" USING btree ("user_id");--> statement-breakpoint
-- emergency_access_audit is append-only: no UPDATE ever, and no DELETE except a
-- future retention job that opts in per-transaction with
--   SET LOCAL emergency_access_audit.retention_purge = 'on'
-- Same pattern as drizzle/0001_audit_log_append_only.sql. No such retention job
-- exists yet; the escape hatch is latent, exactly as safe as audit_log's.
CREATE OR REPLACE FUNCTION emergency_access_audit_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('emergency_access_audit.retention_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'emergency_access_audit is append-only: % is not permitted outside the retention job', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER emergency_access_audit_no_update
  BEFORE UPDATE ON emergency_access_audit
  FOR EACH ROW
  EXECUTE FUNCTION emergency_access_audit_prevent_mutation();--> statement-breakpoint
CREATE TRIGGER emergency_access_audit_no_delete
  BEFORE DELETE ON emergency_access_audit
  FOR EACH ROW
  EXECUTE FUNCTION emergency_access_audit_prevent_mutation();