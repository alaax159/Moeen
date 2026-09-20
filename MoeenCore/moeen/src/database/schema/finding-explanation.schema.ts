import {
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { validationStatusEnum } from './guidance-shared.schema';

export const findingExplanation = pgTable(
  'finding_explanation',
  {
    id: serial('id').primaryKey(),

    // Policy-versioned hash of one finding in one immutable safety run. It
    // includes run/context/engine/dataset provenance as well as finding
    // content, so a later run can never reuse an answer from an older one.
    findingHash: varchar('finding_hash', { length: 64 }).notNull(),

    text: text('text').notNull(),

    citations: jsonb('citations').$type<string[]>().notNull().default([]),

    validationStatus: validationStatusEnum('validation_status').notNull(),

    generatedAt: timestamp('generated_at').notNull().defaultNow(),
  },
  (table) => [
    // GET /safety-checks/:id/explanation reads through this key; a read
    // must never trigger generation, so the hash alone has to uniquely
    // identify a cached explanation.
    uniqueIndex('finding_explanation_finding_hash_idx').on(table.findingHash),
  ],
);
