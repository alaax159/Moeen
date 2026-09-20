import {
  date,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { scheduleTime } from './schedule-time.schema';
import { userMedication } from './user-medication.schema';

export const doseLogStatusEnum = pgEnum('dose_log_status', [
  'taken',
  'skipped',
  'pending',
  'snoozed',
  'missed',
]);

export const doseLog = pgTable(
  'dose_log',
  {
    id: serial('id').primaryKey(),

    // Stable anchor: survives schedule-time edits/deletions so a
    // medication's dose history never disappears just because the user
    // changed their times.
    userMedicationId: integer('user_medication_id')
      .notNull()
      .references(() => userMedication.id, { onDelete: 'cascade' }),

    // Nullable + set-null on delete: if the schedule-time slot this dose
    // was generated from is later removed, the historical row (status,
    // scheduledFor, notifiedAt, ...) stays intact, just unlinked.
    scheduleTimeId: integer('schedule_time_id').references(
      () => scheduleTime.id,
      { onDelete: 'set null' },
    ),

    // which calendar day this dose instance belongs to
    date: date('date').notNull(),

    // TODO(tz): these three columns are `timestamp` WITHOUT time zone. The app
    // writes them as UTC wall-clock (Drizzle -> `.toISOString()`), but
    // node-postgres reads a bare `timestamp` back by parsing in the process's
    // local timezone, so the round-trip only holds while the process runs in
    // UTC. That is currently guaranteed by the `process.env.TZ = 'UTC'` pin in
    // src/set-process-timezone.ts — a stopgap. The fully robust fix is to make
    // these `timestamp('...', { withTimezone: true })` and migrate existing
    // values with `... AT TIME ZONE 'UTC'`. Deliberately deferred as separate
    // work (schema + migration, touches every timestamp column, not just here).

    // Exact moment this dose was due, captured at generation time. Kept
    // even if the live schedule-time is later edited or deleted, so past
    // doses always show what was actually scheduled.
    scheduledFor: timestamp('scheduled_for').notNull(),

    status: doseLogStatusEnum('status').notNull(),

    // When the reminder notification actually fired for this dose.
    notifiedAt: timestamp('notified_at'),

    // When the row's status last changed (taken / skipped / snoozed / missed).
    markedAt: timestamp('marked_at').notNull().defaultNow(),

    // How many times this dose's reminder has been snoozed. Capped at 2,
    // enforced server-side in DatabaseRepository.snoozeDose.
    snoozeCount: integer('snooze_count').notNull().default(0),
  },
  (table) => [
    uniqueIndex('dose_log_schedule_time_id_date_idx').on(
      table.scheduleTimeId,
      table.date,
    ),
  ],
);
