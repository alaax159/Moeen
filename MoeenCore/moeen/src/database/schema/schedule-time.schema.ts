import {
  integer,
  pgTable,
  serial,
  time,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { userMedication } from './user-medication.schema';

export const scheduleTime = pgTable(
  'schedule_time',
  {
    id: serial('id').primaryKey(),

    userMedicationId: integer('user_medication_id')
      .notNull()
      .references(() => userMedication.id, { onDelete: 'cascade' }),

    // Stored as a normalized time value so "08:00", "8:00 AM" and "08:00:00"
    // all collapse to the same row instead of duplicating a reminder slot.
    time: time('time').notNull(),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('schedule_time_user_medication_id_time_idx').on(
      table.userMedicationId,
      table.time,
    ),
  ],
);
