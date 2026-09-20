import {
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
} from 'drizzle-orm/pg-core';

import { user } from './user.schema';

export const emergencyNotificationEventEnum = pgEnum(
  'emergency_notification_event',
  ['severe_medication_reaction'],
);

export const emergencyNotificationStatusEnum = pgEnum(
  'emergency_notification_status',
  ['sent', 'failed'],
);

/**
 * Delivery record: one row per emergency-contact SMS send attempt (success or
 * failure), written by EmergencyContactNotificationService.notify() after each
 * SmsSenderPort.send() call resolves. A plain audit-of-delivery — not the
 * append-only security invariant that emergency_access_audit protects — so no
 * append-only trigger and no reconciler.
 *
 * `contactId` is emergency_contact.id with no FK: a delivery record should
 * outlive deletion of the contact it refers to. Only `userId` cascades.
 */
export const emergencyNotificationLog = pgTable(
  'emergency_notification_log',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    contactId: integer('contact_id').notNull(),
    event: emergencyNotificationEventEnum('event').notNull(),
    status: emergencyNotificationStatusEnum('status').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('emergency_notification_log_user_id_sent_at_idx').on(
      table.userId,
      table.sentAt,
    ),
  ],
);
