CREATE TYPE "public"."medication_catalog_source" AS ENUM('palestine_moh');
CREATE TYPE "public"."verification_source" AS ENUM('palestine_moh', 'dailymed', 'rxnorm', 'manual');
CREATE TYPE "public"."medication_verification_status" AS ENUM('verified', 'unresolved');

CREATE TABLE "medication_catalog" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "manufacturer" text,
  "dosage_form" text,
  "source" "medication_catalog_source" NOT NULL,
  "external_id" varchar(255),
  "is_essential" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "medication" ADD COLUMN "medication_catalog_id" integer;
ALTER TABLE "medication" ADD COLUMN "verification_source" "verification_source";
ALTER TABLE "medication" ADD COLUMN "verification_status" "medication_verification_status" DEFAULT 'unresolved' NOT NULL;
ALTER TABLE "medication" ADD CONSTRAINT "medication_medication_catalog_id_medication_catalog_id_fk" FOREIGN KEY ("medication_catalog_id") REFERENCES "public"."medication_catalog"("id") ON DELETE restrict ON UPDATE no action;

UPDATE "medication"
SET "verification_source" = CASE
  WHEN "dailymed_id" IS NOT NULL THEN 'dailymed'::"verification_source"
  ELSE 'manual'::"verification_source"
END,
"verification_status" = CASE
  WHEN "verified" = 'verified' THEN 'verified'::"medication_verification_status"
  ELSE 'unresolved'::"medication_verification_status"
END;

CREATE UNIQUE INDEX "medication_catalog_source_external_id_idx" ON "medication_catalog" USING btree ("source", "external_id");
CREATE UNIQUE INDEX "medication_catalog_fallback_identity_idx" ON "medication_catalog" USING btree ("normalized_name", "manufacturer", "dosage_form") WHERE "external_id" IS NULL;
CREATE UNIQUE INDEX "medication_catalog_id_idx" ON "medication" USING btree ("medication_catalog_id");
