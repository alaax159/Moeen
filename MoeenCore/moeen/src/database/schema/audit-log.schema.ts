import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { user } from './user.schema';
import {
  guidanceIntentEnum,
  validationStatusEnum,
} from './guidance-shared.schema';
import { medicationSafetyRun } from './medication-safety-run.schema';

export const auditTriggerEnum = pgEnum('audit_trigger', [
  'patient_chat',
  'missed_dose_job',
  'explain_finding_request',
]);

export const redactionStatusEnum = pgEnum('redaction_status', [
  'ok',
  'aborted',
]);

// Append-only at the database level: a BEFORE UPDATE OR DELETE trigger
// rejects both, regardless of which DB role issues the statement — see
// drizzle/0001_audit_log_append_only.sql. Never add an .update()/.delete()
// call against this table in application code; it will fail by design.
export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),

  userId: integer('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  intent: guidanceIntentEnum('intent').notNull(),

  trigger: auditTriggerEnum('trigger').notNull(),

  promptVersion: varchar('prompt_version', { length: 100 }),

  safetyRunId: uuid('safety_run_id').references(() => medicationSafetyRun.id, {
    onDelete: 'set null',
  }),

  // Citation ids retrieved for this run, whether or not the final response
  // ended up citing all of them.
  retrievedCitationIds: jsonb('retrieved_citation_ids')
    .$type<string[]>()
    .notNull()
    .default([]),

  redactionStatus: redactionStatusEnum('redaction_status').notNull(),

  // Null when the run never reached the validation stage (e.g. redaction
  // aborted, provider timed out) — distinct from 'rejected_fallback',
  // which means validation ran and rejected the output.
  validationStatus: validationStatusEnum('validation_status'),

  tokensIn: integer('tokens_in'),

  tokensOut: integer('tokens_out'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});
