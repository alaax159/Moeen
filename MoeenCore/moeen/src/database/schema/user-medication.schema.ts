import {
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import { medication } from './medication.schema';
import { user } from './user.schema';

export const userMedicationStatusEnum = pgEnum('user_medication_status', [
  'active',
  'archived',
]);

export const userMedicationCompletionEnum = pgEnum(
  'user_medication_completion',
  ['ongoing', 'completed', 'cancelled'],
);

export const userMedication = pgTable('user_medication', {
  id: serial('id').primaryKey(),

  userId: integer('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  medicationId: integer('medication_id')
    .notNull()
    .references(() => medication.id, { onDelete: 'restrict' }),

  frequency: integer('frequency').notNull(),

  dosageAmount: numeric('dosage_amount', {
    precision: 10,
    scale: 2,
  }).notNull(),

  dosageUnit: varchar('dosage_unit', { length: 50 }).notNull(),

  dosageForm: varchar('dosage_form', { length: 50 }).notNull(),

  instructions: text('instructions'),

  status: userMedicationStatusEnum('status').notNull().default('active'),

  completion: userMedicationCompletionEnum('completion')
    .notNull()
    .default('ongoing'),

  startDate: date('start_date').notNull(),

  endDate: date('end_date'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
