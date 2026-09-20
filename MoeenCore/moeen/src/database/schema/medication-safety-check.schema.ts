import {
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
} from 'drizzle-orm/pg-core';

import { userMedication } from './user-medication.schema';

export const medicationSafetyCheckStatusEnum = pgEnum(
  'medication_safety_check_status',
  ['checked', 'failed'],
);

/**
 * One row per medication, recording that a safety check has run for it —
 * independent of whether it produced any `medication_safety_warnings` rows.
 * `status` is the outcome of the most recent attempt; `checked_at` is the last
 * *successful* check (null until the first success). The unique `userMedicationId`
 * also serializes concurrent first-read recomputes (see SafetyWarningRepository).
 */
export const medicationSafetyCheck = pgTable('medication_safety_check', {
  id: serial('id').primaryKey(),

  userMedicationId: integer('user_medication_id')
    .notNull()
    .unique()
    .references(() => userMedication.id, { onDelete: 'cascade' }),

  status: medicationSafetyCheckStatusEnum('status').notNull(),

  checkedAt: timestamp('checked_at'),
});
