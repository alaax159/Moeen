import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../database.constants';
import * as schema from '../schema';

type Database = NodePgDatabase<typeof schema>;

export type PersistableMedicationSafetyWarning = {
  warningType:
    'drug_drug' | 'drug_allergy' | 'drug_condition' | 'duplicate_therapy';
  severity: string;
  message: string;
  affected?: string;
};

@Injectable()
export class SafetyWarningRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getMedicationContext(userMedicationId: number) {
    const medication = await this.db
      .select({
        userMedicationId: schema.userMedication.id,
        userId: schema.userMedication.userId,
        medicationId: schema.medication.id,
        brandName: schema.medication.brandName,
        genericName: schema.medication.genericName,
      })
      .from(schema.userMedication)
      .innerJoin(
        schema.medication,
        eq(schema.userMedication.medicationId, schema.medication.id),
      )
      .where(eq(schema.userMedication.id, userMedicationId))
      .limit(1);

    return medication[0];
  }

  async getActiveChronicConditions(userId: number) {
    const activeChronicConditions = await this.db
      .select({
        id: schema.userChronicCondition.id,
        name: schema.chronicConditionConcept.name,
        externalId: schema.chronicConditionConcept.externalId,
      })
      .from(schema.userChronicCondition)
      .innerJoin(
        schema.chronicConditionConcept,
        eq(
          schema.userChronicCondition.conditionConceptId,
          schema.chronicConditionConcept.id,
        ),
      )
      .where(
        and(
          eq(schema.userChronicCondition.userId, userId),
          eq(schema.userChronicCondition.isActive, true),
        ),
      );

    return activeChronicConditions;
  }

  async getActiveWarnings(userMedicationIds: number[]) {
    if (userMedicationIds.length === 0) return [];

    return this.db
      .select({
        userMedicationId: schema.medicationSafetyWarning.userMedicationId,
        warningType: schema.medicationSafetyWarning.warningType,
        severity: schema.medicationSafetyWarning.severity,
        message: schema.medicationSafetyWarning.message,
        affected: schema.medicationSafetyWarning.affected,
      })
      .from(schema.medicationSafetyWarning)
      .where(
        and(
          inArray(
            schema.medicationSafetyWarning.userMedicationId,
            userMedicationIds,
          ),
          eq(schema.medicationSafetyWarning.isActive, true),
        ),
      );
  }

  /**
   * Records the outcome of a completed safety check for a medication: replaces
   * its active warning rows with `warnings` and marks its `medication_safety_check`
   * row `checked` with `checked_at = now()`. Both callers (the safety-warnings
   * endpoint and CurrentMedicationRecheckService) go through here, so an
   * empty `warnings` list still records that the medication was checked.
   *
   * The `user_medication` row is locked `FOR UPDATE` first so two overlapping
   * first-read recomputes for the same medication serialize instead of both
   * inserting — the last writer's warning set is the one that stays active.
   */
  async replaceActiveWarnings(
    userMedicationId: number,
    warnings: PersistableMedicationSafetyWarning[],
  ): Promise<void> {
    const checkedAt = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .select({ id: schema.userMedication.id })
        .from(schema.userMedication)
        .where(eq(schema.userMedication.id, userMedicationId))
        .for('update');

      await tx
        .update(schema.medicationSafetyWarning)
        .set({
          isActive: false,
          checkedAt,
        })
        .where(
          and(
            eq(
              schema.medicationSafetyWarning.userMedicationId,
              userMedicationId,
            ),
            eq(schema.medicationSafetyWarning.isActive, true),
          ),
        );

      if (warnings.length > 0) {
        await tx.insert(schema.medicationSafetyWarning).values(
          warnings.map((warning) => ({
            userMedicationId,
            warningType: warning.warningType,
            severity: warning.severity,
            message: warning.message,
            affected: warning.affected ?? null,
            isActive: true,
            checkedAt,
          })),
        );
      }

      await tx
        .insert(schema.medicationSafetyCheck)
        .values({ userMedicationId, status: 'checked', checkedAt })
        .onConflictDoUpdate({
          target: schema.medicationSafetyCheck.userMedicationId,
          set: { status: 'checked', checkedAt },
        });
    });
  }

  /**
   * Marks a medication's check `failed` after a live recompute threw. Only flips
   * `status` — `checked_at` (last successful check) and the existing warning rows
   * are left untouched, so the endpoint can still surface the last known-good
   * state alongside the failed status.
   */
  async recordFailedCheck(userMedicationId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .select({ id: schema.userMedication.id })
        .from(schema.userMedication)
        .where(eq(schema.userMedication.id, userMedicationId))
        .for('update');

      await tx
        .insert(schema.medicationSafetyCheck)
        .values({ userMedicationId, status: 'failed', checkedAt: null })
        .onConflictDoUpdate({
          target: schema.medicationSafetyCheck.userMedicationId,
          set: { status: 'failed' },
        });
    });
  }

  /**
   * Every currently-active safety warning for the user's medications, newest
   * check first. Returns all warning types (not just allergy/condition) so the
   * caller can distinguish "medication was rechecked, nothing found" from
   * "medication never rechecked" by whether it has any row here.
   */
  async findActiveWarningsForUser(userId: number) {
    return this.db
      .select({
        userMedicationId: schema.medicationSafetyWarning.userMedicationId,
        warningType: schema.medicationSafetyWarning.warningType,
        severity: schema.medicationSafetyWarning.severity,
        message: schema.medicationSafetyWarning.message,
        checkedAt: schema.medicationSafetyWarning.checkedAt,
      })
      .from(schema.medicationSafetyWarning)
      .innerJoin(
        schema.userMedication,
        eq(
          schema.medicationSafetyWarning.userMedicationId,
          schema.userMedication.id,
        ),
      )
      .where(
        and(
          eq(schema.userMedication.userId, userId),
          eq(schema.medicationSafetyWarning.isActive, true),
        ),
      )
      .orderBy(desc(schema.medicationSafetyWarning.checkedAt));
  }

  /** The recorded check state for each of the user's medications that has one. */
  async findCheckStatusesForUser(userId: number) {
    return this.db
      .select({
        userMedicationId: schema.medicationSafetyCheck.userMedicationId,
        status: schema.medicationSafetyCheck.status,
        checkedAt: schema.medicationSafetyCheck.checkedAt,
      })
      .from(schema.medicationSafetyCheck)
      .innerJoin(
        schema.userMedication,
        eq(
          schema.medicationSafetyCheck.userMedicationId,
          schema.userMedication.id,
        ),
      )
      .where(eq(schema.userMedication.userId, userId));
  }
}
