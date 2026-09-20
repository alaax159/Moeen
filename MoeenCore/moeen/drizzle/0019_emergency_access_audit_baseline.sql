ALTER TABLE "emergency_access" ADD COLUMN "audit_baseline_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Rows that existed before audit logging: their `version` counts mutations that
-- were never audited. Freeze that count as the baseline so the reconciler only
-- expects audit rows for mutations from here forward. New rows get DEFAULT 0.
UPDATE "emergency_access" SET "audit_baseline_version" = "version";