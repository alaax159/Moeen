-- New dependency: label_chunk.embedding is a pgvector column. Requires the
-- Postgres 'vector' extension to be installed on the server — plain
-- postgres:17 does not ship it; needs pgvector/pgvector:pg17 or equivalent.
-- This migration will fail loudly (not silently) until that's true, by
-- design — see moeen_pgvector_setup notes in the day-zero writeup.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."label_section" AS ENUM('indications', 'dosage_and_administration', 'warnings', 'contraindications', 'adverse_reactions', 'drug_interactions');--> statement-breakpoint
CREATE TABLE "label_chunk" (
	"id" serial PRIMARY KEY NOT NULL,
	"medication_id" integer NOT NULL,
	"set_id" varchar(255) NOT NULL,
	"label_version" varchar(50) NOT NULL,
	"section" "label_section" NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"token_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "label_chunk" ADD CONSTRAINT "label_chunk_medication_id_medication_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "label_chunk_set_id_version_ordinal_idx" ON "label_chunk" USING btree ("set_id","label_version","ordinal");--> statement-breakpoint
CREATE INDEX "label_chunk_embedding_hnsw_idx" ON "label_chunk" USING hnsw ("embedding" vector_cosine_ops);