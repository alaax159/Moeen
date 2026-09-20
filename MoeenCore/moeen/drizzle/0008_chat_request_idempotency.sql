ALTER TABLE "chat_message" ADD COLUMN "request_id" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_request_id_role_idx" ON "chat_message" USING btree ("request_id","role");