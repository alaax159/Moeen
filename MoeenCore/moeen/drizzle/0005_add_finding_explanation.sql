CREATE TABLE "finding_explanation" (
	"id" serial PRIMARY KEY NOT NULL,
	"finding_hash" varchar(64) NOT NULL,
	"text" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation_status" "validation_status" NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "finding_explanation_finding_hash_idx" ON "finding_explanation" USING btree ("finding_hash");