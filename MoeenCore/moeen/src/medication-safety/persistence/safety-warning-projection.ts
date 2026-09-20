import { and, asc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from '../../database/schema';

type Database = NodePgDatabase<typeof schema>;
type SafetyWarningProjectionTransaction = Pick<
  Database,
  'insert' | 'select' | 'update'
>;

/**
 * Rebuilds the legacy warning rows from the authoritative current-finding
 * projection. Call this inside the same transaction that advances
 * medication_safety_current_finding.
 */
export async function syncSafetyWarningProjection(
  tx: SafetyWarningProjectionTransaction,
  subjectUserMedicationId: number,
  checkedAt: Date,
): Promise<void> {
  const currentWarnings = await tx
    .select({
      warningType: schema.medicationSafetyCurrentFinding.checkerType,
      severity: schema.medicationSafetyFinding.severity,
      message: schema.medicationSafetyFinding.rationale,
      affected: schema.medicationSafetyFinding.affected,
      findingKey: schema.medicationSafetyCurrentFinding.findingKey,
    })
    .from(schema.medicationSafetyCurrentFinding)
    .innerJoin(
      schema.medicationSafetyFinding,
      eq(
        schema.medicationSafetyCurrentFinding.findingId,
        schema.medicationSafetyFinding.id,
      ),
    )
    .where(
      eq(
        schema.medicationSafetyCurrentFinding.subjectUserMedicationId,
        subjectUserMedicationId,
      ),
    )
    .orderBy(
      asc(schema.medicationSafetyCurrentFinding.checkerType),
      asc(schema.medicationSafetyCurrentFinding.findingKey),
    );

  await tx
    .update(schema.medicationSafetyWarning)
    .set({ isActive: false, checkedAt })
    .where(
      and(
        eq(
          schema.medicationSafetyWarning.userMedicationId,
          subjectUserMedicationId,
        ),
        eq(schema.medicationSafetyWarning.isActive, true),
      ),
    );

  if (currentWarnings.length === 0) return;

  await tx.insert(schema.medicationSafetyWarning).values(
    currentWarnings.map(({ findingKey: _findingKey, ...warning }) => ({
      userMedicationId: subjectUserMedicationId,
      ...warning,
      isActive: true,
      checkedAt,
    })),
  );
}
