ALTER TABLE "dose_log"
ADD COLUMN IF NOT EXISTS "snooze_count" integer DEFAULT 0 NOT NULL;