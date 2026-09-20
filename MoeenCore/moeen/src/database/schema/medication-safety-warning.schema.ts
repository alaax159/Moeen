import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import { userMedication } from './user-medication.schema';

export const medicationSafetyWarningTypeEnum = pgEnum(
  'medication_safety_warning_type',
  ['drug_drug', 'drug_allergy', 'drug_condition', 'duplicate_therapy'],
);

export const medicationSafetyWarning = pgTable(
  'medication_safety_warnings',
  {
    id: serial('id').primaryKey(),

    userMedicationId: integer('user_medication_id')
      .notNull()
      .references(() => userMedication.id, { onDelete: 'cascade' }),

    warningType: medicationSafetyWarningTypeEnum('warning_type').notNull(),

    severity: varchar('severity', { length: 50 }).notNull(),

    message: text('message').notNull(),

    affected: text('affected'),

    isActive: boolean('is_active').notNull().default(true),

    checkedAt: timestamp('checked_at').notNull().defaultNow(),
  },
  (table) => [
    index('medication_safety_warnings_medication_active_idx').on(
      table.userMedicationId,
      table.isActive,
    ),
  ],
);
