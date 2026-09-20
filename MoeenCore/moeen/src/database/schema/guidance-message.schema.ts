import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { scheduleTime } from './schedule-time.schema';
import { validationStatusEnum } from './guidance-shared.schema';
import { medicationSafetyRun } from './medication-safety-run.schema';

export const guidanceMessage = pgTable(
  'guidance_message',
  {
    id: serial('id').primaryKey(),

    // Set null (not cascade) on schedule-time deletion, matching dose_log's
    // convention: a cached message stays readable even if the schedule
    // slot it was generated for is later edited or removed.
    scheduleTimeId: integer('schedule_time_id').references(
      () => scheduleTime.id,
      { onDelete: 'set null' },
    ),

    date: date('date').notNull(),

    text: text('text').notNull(),

    citations: jsonb('citations').$type<string[]>().notNull().default([]),

    validationStatus: validationStatusEnum('validation_status').notNull(),

    safetyRunId: uuid('safety_run_id').references(
      () => medicationSafetyRun.id,
      { onDelete: 'set null' },
    ),

    generatedAt: timestamp('generated_at').notNull().defaultNow(),
  },
  (table) => [
    // GET /doses/today reads through this key; a read must never trigger
    // generation, so this pair has to uniquely identify a cached message.
    uniqueIndex('guidance_message_schedule_time_id_date_idx').on(
      table.scheduleTimeId,
      table.date,
    ),
    index('guidance_message_safety_run_idx').on(table.safetyRunId),
  ],
);
