import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { user } from './user.schema';

export const emergencyAccess = pgTable(
  'emergency_access',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }),
    enabled: boolean('enabled').notNull().default(false),
    version: integer('version').notNull().default(1),
    // Frozen at the migration that added emergency_access_audit: how many
    // mutations this record had before audit logging existed. The reconciler
    // expects `version - auditBaselineVersion` audit rows. New rows created
    // after that migration get 0 and reconcile from version 1.
    auditBaselineVersion: integer('audit_baseline_version').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('emergency_access_user_id_idx').on(table.userId),
    uniqueIndex('emergency_access_token_hash_idx').on(table.tokenHash),
    check(
      'emergency_access_enabled_token_hash_check',
      sql`${table.enabled} = (${table.tokenHash} IS NOT NULL)`,
    ),
  ],
);
