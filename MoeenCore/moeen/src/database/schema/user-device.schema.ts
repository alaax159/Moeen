import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { user } from './user.schema';

export const deviceTypeEnum = pgEnum('device_type', [
  'android',
  'ios',
  'emulator',
]);

export const userDevice = pgTable(
  'user_devices',
  {
    id: serial('id').primaryKey(),

    userId: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    expoPushToken: varchar('expo_push_token', {
      length: 255,
    }).notNull(),

    deviceType: deviceTypeEnum('device_type').notNull(),

    isActive: boolean('is_active')
      .notNull()
      .default(true),

    lastSeenAt: timestamp('last_seen_at')
      .notNull()
      .defaultNow(),

    createdAt: timestamp('created_at')
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at')
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('user_devices_expo_push_token_idx').on(
      table.expoPushToken,
    ),
  ],
);