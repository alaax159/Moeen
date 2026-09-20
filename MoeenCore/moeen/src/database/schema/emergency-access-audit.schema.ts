import {
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
} from 'drizzle-orm/pg-core';

import { user } from './user.schema';

export const emergencyAccessAuditActionEnum = pgEnum(
  'emergency_access_audit_action',
  ['enabled', 'regenerated', 'disabled'],
);

/**
 * Append-only history of emergency-access token lifecycle events (enable /
 * regenerate / revoke). Written best-effort by EmergencyAccessService after each
 * mutation commits — a failed write here never blocks the mutation (see its
 * recordAccessEvent helper). Append-only is enforced at the DB level by a
 * BEFORE UPDATE OR DELETE trigger in drizzle/0018_emergency_access_audit.sql,
 * the same pattern audit_log uses (drizzle/0001_audit_log_append_only.sql).
 *
 * The user_id FK is intentionally NOT `onDelete: 'cascade'`: the append-only
 * trigger would reject the cascade delete anyway, and audit rows must not
 * silently vanish with a user row. A real account-deletion flow (none exists
 * today) has to deal with these rows explicitly.
 */
export const emergencyAccessAudit = pgTable(
  'emergency_access_audit',
  {
    id: serial('id').primaryKey(),

    userId: integer('user_id')
      .notNull()
      .references(() => user.id),

    action: emergencyAccessAuditActionEnum('action').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('emergency_access_audit_user_id_idx').on(table.userId),
  ],
);
