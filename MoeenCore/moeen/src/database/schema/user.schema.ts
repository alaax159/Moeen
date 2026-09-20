import {
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

export const user = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    firebaseUid: varchar('firebase_uid', { length: 128 }).notNull(),
    email: varchar('email', { length: 320 }),
    firstName: varchar('first_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_firebase_uid_idx').on(table.firebaseUid),
    uniqueIndex('users_email_idx').on(table.email),
  ],
);
