import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { user } from './user.schema';

export const emergencyContact = pgTable(
  'emergency_contact',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    phone: varchar('phone', { length: 20 }).notNull(),
    relationship: varchar('relationship', { length: 50 }),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('emergency_contact_user_id_idx').on(table.userId),
    // DB-enforced: at most one primary contact per user.
    uniqueIndex('emergency_contact_one_primary_per_user_idx')
      .on(table.userId)
      .where(sql`${table.isPrimary}`),
  ],
);
