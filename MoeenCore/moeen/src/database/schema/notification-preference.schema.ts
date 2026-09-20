import {
  boolean,
  integer,
  pgTable,
  serial,
  timestamp,
} from 'drizzle-orm/pg-core';

import { user } from './user.schema';

export const notificationPreference = pgTable(
  'notification_prefs',
  {
    id: serial('id').primaryKey(),

    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),

    followUpEnabled: boolean('follow_up_enabled')
      .notNull()
      .default(false),

    followUpDelayMin: integer('follow_up_delay_min'),

    emergencyContactSmsEnabled: boolean('emergency_contact_sms_enabled')
      .notNull()
      .default(true),

    createdAt: timestamp('created_at')
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow(),
  },
);
