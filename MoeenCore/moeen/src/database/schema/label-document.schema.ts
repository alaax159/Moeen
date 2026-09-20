import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { medication } from './medication.schema';

export const labelFetchStatusEnum = pgEnum('label_fetch_status', [
  'pending',
  'fetched',
  'failed',
  'dead_letter',
]);

export const labelDocument = pgTable(
  'label_document',
  {
    id: serial('id').primaryKey(),

    medicationId: integer('medication_id')
      .notNull()
      .references(() => medication.id, { onDelete: 'cascade' }),

    setId: varchar('set_id', { length: 255 }).notNull(),

    labelVersion: varchar('label_version', { length: 50 }).notNull(),

    fetchStatus: labelFetchStatusEnum('fetch_status')
      .notNull()
      .default('pending'),

    // Raw SPL text as returned by DailyMed, kept so the splitter/chunker
    // can be rerun without re-fetching. Null until a fetch succeeds.
    rawContent: text('raw_content'),

    // Populated on failure so a dead-lettered job is diagnosable without
    // digging through queue logs.
    failureReason: text('failure_reason'),

    retryCount: integer('retry_count').notNull().default(0),

    fetchedAt: timestamp('fetched_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('label_document_set_id_version_idx').on(
      table.setId,
      table.labelVersion,
    ),
  ],
);
