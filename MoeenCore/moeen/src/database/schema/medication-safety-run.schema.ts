import { sql } from 'drizzle-orm';
import {
  char,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  userAllergy,
  userChronicCondition,
} from './allergiesAndChronicCondition.shema';
import { userMedication } from './user-medication.schema';
import { user } from './user.schema';

export const medicationSafetyTriggerEnum = pgEnum('medication_safety_trigger', [
  'medication_added',
  'medication_updated',
  'medication_precheck',
  'active_review',
  'dose_missed',
  'medication_archived',
  'allergy_updated',
  'condition_updated',
  'knowledge_updated',
  'label_updated',
  'manual_recheck',
]);

export const medicationSafetyCheckerTypeEnum = pgEnum(
  'medication_safety_checker_type',
  ['drug_drug', 'drug_allergy', 'drug_condition', 'duplicate_therapy'],
);

export const medicationSafetyCoverageStatusEnum = pgEnum(
  'medication_safety_coverage_status',
  ['complete', 'partial', 'failed'],
);

export const medicationSafetyCheckerStatusEnum = pgEnum(
  'medication_safety_checker_status',
  ['verified', 'not_applicable', 'partial', 'unavailable', 'failed'],
);

export const medicationSafetyOutcomeEnum = pgEnum('medication_safety_outcome', [
  'clear',
  'findings',
  'unverified',
]);

export const medicationSafetyFindingTypeEnum = pgEnum(
  'medication_safety_finding_type',
  [
    'drug_interaction',
    'allergy_conflict',
    'condition_caution',
    'duplicate_therapy',
  ],
);

export const medicationSafetySeverityEnum = pgEnum(
  'medication_safety_severity',
  ['minor', 'moderate', 'major', 'contraindicated'],
);

export const medicationSafetyOutboxStatusEnum = pgEnum(
  'medication_safety_outbox_status',
  ['pending', 'processing', 'completed', 'failed', 'dead_letter'],
);

/** Monotonic invalidation fence for all safety data belonging to one user. */
export const patientSafetyState = pgTable('patient_safety_state', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  contextVersion: integer('context_version').notNull().default(0),
  invalidationReason: medicationSafetyTriggerEnum('invalidation_reason'),
  invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * An immutable execution of the deterministic safety engine.
 *
 * `contextSnapshot` is deliberately minimized to clinical identifiers and
 * normalized values used by the check. It must never contain names, contact
 * details, dates of birth, notes, or other free patient text.
 */
export const medicationSafetyRun = pgTable(
  'medication_safety_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    subjectUserMedicationId: integer('subject_user_medication_id').references(
      () => userMedication.id,
      { onDelete: 'set null' },
    ),
    trigger: medicationSafetyTriggerEnum('trigger').notNull(),
    requiredChecks: jsonb('required_checks').$type<string[]>().notNull(),
    outcome: medicationSafetyOutcomeEnum('outcome').notNull(),
    coverageStatus:
      medicationSafetyCoverageStatusEnum('coverage_status').notNull(),
    engineVersion: varchar('engine_version', { length: 100 }).notNull(),
    datasetVersions: jsonb('dataset_versions')
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    contextSnapshot: jsonb('context_snapshot')
      .$type<Record<string, unknown>>()
      .notNull(),
    contextHash: char('context_hash', { length: 64 }).notNull(),
    contextVersion: integer('context_version').notNull().default(0),
    idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('medication_safety_run_idempotency_idx').on(
      table.idempotencyKey,
    ),
    index('medication_safety_run_user_completed_idx').on(
      table.userId,
      table.completedAt,
    ),
    index('medication_safety_run_subject_completed_idx').on(
      table.subjectUserMedicationId,
      table.completedAt,
    ),
    check(
      'medication_safety_run_time_order_check',
      sql`${table.completedAt} >= ${table.startedAt}`,
    ),
    check(
      'medication_safety_run_clear_coverage_check',
      sql`${table.outcome} <> 'clear' OR ${table.coverageStatus} = 'complete'`,
    ),
  ],
);

/** Durable at-least-once work created in the same transaction as mutations. */
export const medicationSafetyRecheckOutbox = pgTable(
  'medication_safety_recheck_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    subjectUserMedicationId: integer('subject_user_medication_id').references(
      () => userMedication.id,
      { onDelete: 'set null' },
    ),
    trigger: medicationSafetyTriggerEnum('trigger').notNull(),
    contextVersion: integer('context_version').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull(),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: medicationSafetyOutboxStatusEnum('status')
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('medication_safety_recheck_outbox_idempotency_idx').on(
      table.idempotencyKey,
    ),
    index('medication_safety_recheck_outbox_poll_idx').on(
      table.status,
      table.availableAt,
    ),
    index('medication_safety_recheck_outbox_user_version_idx').on(
      table.userId,
      table.contextVersion,
    ),
  ],
);

export const medicationSafetyCheckerResult = pgTable(
  'medication_safety_checker_result',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => medicationSafetyRun.id, { onDelete: 'cascade' }),
    checkerType: medicationSafetyCheckerTypeEnum('checker_type').notNull(),
    status: medicationSafetyCheckerStatusEnum('status').notNull(),
    reasonCode: varchar('reason_code', { length: 100 }),
    datasetVersions: jsonb('dataset_versions')
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('medication_safety_checker_run_type_idx').on(
      table.runId,
      table.checkerType,
    ),
  ],
);

export const medicationSafetyFinding = pgTable(
  'medication_safety_finding',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    checkerResultId: uuid('checker_result_id')
      .notNull()
      .references(() => medicationSafetyCheckerResult.id, {
        onDelete: 'cascade',
      }),
    findingType: medicationSafetyFindingTypeEnum('finding_type').notNull(),
    severity: medicationSafetySeverityEnum('severity').notNull(),
    rationale: text('rationale').notNull(),
    /** Display name of the allergy/condition this finding is about. */
    affected: text('affected'),
    primaryUserMedicationId: integer('primary_user_medication_id').references(
      () => userMedication.id,
      { onDelete: 'set null' },
    ),
    interactingUserMedicationId: integer(
      'interacting_user_medication_id',
    ).references(() => userMedication.id, { onDelete: 'set null' }),
    subjectUserAllergyId: integer('subject_user_allergy_id').references(
      () => userAllergy.id,
      { onDelete: 'set null' },
    ),
    subjectUserConditionId: integer('subject_user_condition_id').references(
      () => userChronicCondition.id,
      { onDelete: 'set null' },
    ),
    findingKey: varchar('finding_key', { length: 512 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('medication_safety_finding_result_key_idx').on(
      table.checkerResultId,
      table.findingKey,
    ),
    index('medication_safety_finding_checker_idx').on(table.checkerResultId),
  ],
);

export const medicationSafetyEvidence = pgTable(
  'medication_safety_evidence',
  {
    id: serial('id').primaryKey(),
    checkerResultId: uuid('checker_result_id')
      .notNull()
      .references(() => medicationSafetyCheckerResult.id, {
        onDelete: 'cascade',
      }),
    findingId: uuid('finding_id').references(() => medicationSafetyFinding.id, {
      onDelete: 'cascade',
    }),
    source: varchar('source', { length: 100 }).notNull(),
    sourceRecordId: varchar('source_record_id', { length: 255 }),
    sourceVersion: varchar('source_version', { length: 255 }),
    section: varchar('section', { length: 100 }),
    uri: text('uri'),
    contentHash: char('content_hash', { length: 64 }),
    details: jsonb('details').$type<Record<string, unknown>>(),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('medication_safety_evidence_finding_idx').on(table.findingId),
  ],
);

/** Latest coverage plus the most recent complete result for one checker. */
export const medicationSafetyCurrentCheck = pgTable(
  'medication_safety_current_check',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    subjectUserMedicationId: integer('subject_user_medication_id')
      .notNull()
      .references(() => userMedication.id, { onDelete: 'cascade' }),
    checkerType: medicationSafetyCheckerTypeEnum('checker_type').notNull(),
    latestCheckerResultId: uuid('latest_checker_result_id')
      .notNull()
      .references(() => medicationSafetyCheckerResult.id, {
        onDelete: 'cascade',
      }),
    lastCompleteCheckerResultId: uuid(
      'last_complete_checker_result_id',
    ).references(() => medicationSafetyCheckerResult.id, {
      onDelete: 'set null',
    }),
    latestStartedAt: timestamp('latest_started_at', {
      withTimezone: true,
    }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'medication_safety_current_check_pk',
      columns: [table.subjectUserMedicationId, table.checkerType],
    }),
    index('medication_safety_current_check_user_idx').on(table.userId),
  ],
);

/**
 * Materialized active findings. Complete checks replace this set; partial
 * checks may add confirmed findings but never remove earlier verified ones.
 */
export const medicationSafetyCurrentFinding = pgTable(
  'medication_safety_current_finding',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    subjectUserMedicationId: integer('subject_user_medication_id')
      .notNull()
      .references(() => userMedication.id, { onDelete: 'cascade' }),
    checkerType: medicationSafetyCheckerTypeEnum('checker_type').notNull(),
    findingKey: varchar('finding_key', { length: 512 }).notNull(),
    findingId: uuid('finding_id')
      .notNull()
      .references(() => medicationSafetyFinding.id, { onDelete: 'cascade' }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'medication_safety_current_finding_pk',
      columns: [
        table.subjectUserMedicationId,
        table.checkerType,
        table.findingKey,
      ],
    }),
    uniqueIndex('medication_safety_current_finding_id_idx').on(table.findingId),
    index('medication_safety_current_finding_user_idx').on(table.userId),
  ],
);
