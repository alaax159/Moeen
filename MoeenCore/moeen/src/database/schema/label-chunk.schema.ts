import {
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';

import { medication } from './medication.schema';

export const labelSectionEnum = pgEnum('label_section', [
  'indications',
  'dosage_and_administration',
  'warnings',
  'contraindications',
  'adverse_reactions',
  'drug_interactions',
]);

// Matches OpenAI text-embedding-3-small. Provisional pending KC-1's actual
// embedding-service choice — pgvector fixes dimensionality at the column
// level, so changing this later is a breaking migration, not a config edit.
export const EMBEDDING_DIMENSIONS = 1536;

// Dimensions are only the physical pgvector shape. The logical vector space
// is fenced separately by embeddingModel + embeddingVersion on every row.

export const labelChunk = pgTable(
  'label_chunk',
  {
    id: serial('id').primaryKey(),

    medicationId: integer('medication_id')
      .notNull()
      .references(() => medication.id, { onDelete: 'cascade' }),

    setId: varchar('set_id', { length: 255 }).notNull(),

    labelVersion: varchar('label_version', { length: 50 }).notNull(),

    section: labelSectionEnum('section').notNull(),

    ordinal: integer('ordinal').notNull(),

    text: text('text').notNull(),

    embedding: vector('embedding', {
      dimensions: EMBEDDING_DIMENSIONS,
    }).notNull(),

    embeddingModel: varchar('embedding_model', { length: 100 }).notNull(),

    embeddingVersion: varchar('embedding_version', {
      length: 100,
    }).notNull(),

    tokenCount: integer('token_count').notNull(),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    // Enforced at the database level so a re-ingestion bug can't duplicate
    // chunks even if the application-level idempotency check is skipped.
    uniqueIndex('label_chunk_set_id_version_ordinal_idx').on(
      table.setId,
      table.labelVersion,
      table.ordinal,
    ),
    index('label_chunk_embedding_hnsw_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
    index('label_chunk_embedding_profile_idx').on(
      table.embeddingModel,
      table.embeddingVersion,
    ),
  ],
);
