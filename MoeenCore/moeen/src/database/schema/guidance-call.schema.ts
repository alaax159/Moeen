import {
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
} from 'drizzle-orm/pg-core';

import { user } from './user.schema';
import { guidanceIntentEnum } from './guidance-shared.schema';

export const guidanceCallStatusEnum = pgEnum('guidance_call_status', [
  'success',
  'timeout',
  'error',
  'rate_limited',
  'circuit_open',
]);

// One row per model call — cost-visibility from day one, distinct from
// audit_log (one row per full pipeline run, and append-only).
export const guidanceCall = pgTable('guidance_call', {
  id: serial('id').primaryKey(),

  userId: integer('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  intent: guidanceIntentEnum('intent').notNull(),

  // Null when the call never reached the provider (e.g. rate-limited or
  // circuit-open before dispatch).
  tokensIn: integer('tokens_in'),

  tokensOut: integer('tokens_out'),

  latencyMs: integer('latency_ms').notNull(),

  status: guidanceCallStatusEnum('status').notNull(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});
