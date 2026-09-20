CREATE TYPE "public"."chat_request_status" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "request_status" "chat_request_status";
--> statement-breakpoint
UPDATE "chat_message" AS "u"
SET "request_status" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "chat_message" AS "a"
    WHERE "a"."chat_session_id" = "u"."chat_session_id"
      AND "a"."request_id" = "u"."request_id"
      AND "a"."role" = 'assistant'
  )
  THEN 'completed'::"chat_request_status"
  ELSE 'failed'::"chat_request_status"
END
WHERE "u"."role" = 'user'
  AND "u"."request_id" IS NOT NULL
  AND "u"."request_status" IS NULL;
