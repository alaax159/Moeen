import { createHash } from 'node:crypto';

import { and, asc, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../../database/schema';
import type { MedicationSafetyEventType } from '../medication-safety.contracts';

type Database = NodePgDatabase<typeof schema>;
type SafetyMutationTransaction = Pick<
  Database,
  'insert' | 'select' | 'selectDistinct'
>;

export type SafetyInvalidationTrigger = Exclude<
  MedicationSafetyEventType,
  'dose_missed' | 'medication_precheck' | 'active_review'
>;

export interface SafetyInvalidationInput {
  userId: number;
  trigger: SafetyInvalidationTrigger;
  /** Stable, non-clinical mutation identity used only for deduplication. */
  sourceKey: string;
}

export interface SafetyInvalidationResult {
  contextVersion: number;
  queuedUserMedicationIds: number[];
}

/**
 * Invalidates every patient currently taking a medication whose label changed.
 *
 * Call this only when the label's clinical content actually changed — a
 * re-fetch of identical content, or a re-embed under a new embedding profile,
 * carries no new interaction or contraindication data, and rechecking every
 * patient on a widely-prescribed drug for that would be a stampede with
 * nothing to find.
 *
 * Must share the transaction that records the label, so the recheck is queued
 * if and only if the new label is durably stored.
 */
export async function enqueueLabelSafetyInvalidation(
  tx: SafetyMutationTransaction,
  input: { medicationId: number; sourceKey: string },
): Promise<number[]> {
  const affected = await tx
    .selectDistinct({ userId: schema.userMedication.userId })
    .from(schema.userMedication)
    .where(
      and(
        eq(schema.userMedication.medicationId, input.medicationId),
        eq(schema.userMedication.status, 'active'),
        eq(schema.userMedication.completion, 'ongoing'),
      ),
    )
    .orderBy(asc(schema.userMedication.userId));

  for (const { userId } of affected) {
    await enqueueSafetyInvalidation(tx, {
      userId,
      trigger: 'label_updated',
      sourceKey: input.sourceKey,
    });
  }

  return affected.map(({ userId }) => userId);
}

/**
 * Invalidates all prior safety runs and queues one recheck per active
 * medication. This must be called with the same transaction as the mutation.
 */
export async function enqueueSafetyInvalidation(
  tx: SafetyMutationTransaction,
  input: SafetyInvalidationInput,
): Promise<SafetyInvalidationResult> {
  const now = new Date();
  const [state] = await tx
    .insert(schema.patientSafetyState)
    .values({
      userId: input.userId,
      contextVersion: 1,
      invalidationReason: input.trigger,
      invalidatedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.patientSafetyState.userId,
      set: {
        contextVersion: sql`${schema.patientSafetyState.contextVersion} + 1`,
        invalidationReason: input.trigger,
        invalidatedAt: now,
        updatedAt: now,
      },
    })
    .returning({ contextVersion: schema.patientSafetyState.contextVersion });

  if (!state) {
    throw new Error('Patient safety context version could not be advanced');
  }

  const activeMedications = await tx
    .select({ id: schema.userMedication.id })
    .from(schema.userMedication)
    .where(
      and(
        eq(schema.userMedication.userId, input.userId),
        eq(schema.userMedication.status, 'active'),
        eq(schema.userMedication.completion, 'ongoing'),
      ),
    )
    .orderBy(asc(schema.userMedication.id));

  if (activeMedications.length > 0) {
    const sourceHash = createHash('sha256')
      .update(input.sourceKey)
      .digest('hex');

    await tx
      .insert(schema.medicationSafetyRecheckOutbox)
      .values(
        activeMedications.map(({ id }) => ({
          userId: input.userId,
          subjectUserMedicationId: id,
          trigger: input.trigger,
          contextVersion: state.contextVersion,
          idempotencyKey: `${input.trigger}:${sourceHash}:v${state.contextVersion}:m${id}`,
          payload: { sourceKey: sourceHash },
        })),
      )
      .onConflictDoNothing({
        target: schema.medicationSafetyRecheckOutbox.idempotencyKey,
      });
  }

  return {
    contextVersion: state.contextVersion,
    queuedUserMedicationIds: activeMedications.map(({ id }) => id),
  };
}
