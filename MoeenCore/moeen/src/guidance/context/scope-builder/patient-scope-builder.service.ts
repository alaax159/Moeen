import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../../../database/database.constants';
import * as schema from '../../../database/schema';
import {
  PatientScope,
  PatientScopeCondition,
  PatientScopeMedication,
  SafetyCheckResult,
} from '../../contracts';
import {
  BuildPatientScopeParams,
  PatientScopeBuilderPort,
} from './patient-scope-builder.port';
import {
  SafetyResultPort,
  SAFETY_RESULT_PORT,
} from '../../adapters/safety-result-adapter/safety-result-adapter.port';

type Database = NodePgDatabase<typeof schema>;

/**
 * Built additively from an explicit allow-list — every field below is
 * something PatientScope is documented to allow, nothing is derived by
 * stripping down a fuller query result. A new column added to `medication`,
 * `user_medication`, or anywhere else later cannot leak in by default,
 * because nothing here does `select *` or maps a whole row through.
 *
 * Never cached: buildScope re-queries on every call, deliberately. A cache
 * would risk serving stale conditions/allergies/findings to the generative
 * layer after they change.
 */
@Injectable()
export class PatientScopeBuilder implements PatientScopeBuilderPort {
  private readonly logger = new Logger(PatientScopeBuilder.name);

  constructor(
    @Inject(DRIZZLE)
    private readonly db: Database,
    @Inject(SAFETY_RESULT_PORT)
    private readonly safetyResultPort: SafetyResultPort,
  ) {}

  async buildScope(params: BuildPatientScopeParams): Promise<PatientScope> {
    const [medications, conditions, allergies, safetyCheckResult] =
      await Promise.all([
        this.loadMedications(params.patientId),
        this.loadConditions(params.patientId),
        this.loadAllergies(params.patientId),
        this.loadSafetyCheckResult(
          params.patientId,
          params.subjectSafetyCheckId,
          params.safetyRunId,
          params.subjectMedicationId,
        ),
      ]);

    return {
      medications,
      conditions,
      allergies,
      safetyRunId: safetyCheckResult.runId,
      safetyCoverage: safetyCheckResult.coverage,
      safetySeverity: safetyCheckResult.severity,
      findings: safetyCheckResult.findings,
      ...(params.subjectMedicationId !== undefined
        ? { subjectMedicationId: params.subjectMedicationId }
        : {}),
    };
  }

  private async loadSafetyCheckResult(
    patientId: number,
    subjectSafetyCheckId: string | undefined,
    safetyRunId: string | null | undefined,
    subjectMedicationId: number | undefined,
  ): Promise<SafetyCheckResult> {
    if (subjectSafetyCheckId !== undefined && safetyRunId !== undefined) {
      throw new Error(
        'A guidance request cannot select both a safety run and a safety finding',
      );
    }

    if (subjectSafetyCheckId !== undefined) {
      const result = await this.safetyResultPort.getFindingById(
        subjectSafetyCheckId,
        patientId,
      );
      if (!result) {
        throw new Error(
          `No safety finding found for subjectSafetyCheckId "${subjectSafetyCheckId}"`,
        );
      }
      return result;
    }

    if (safetyRunId === null) {
      return this.safetyResultPort.getUnverifiedForPatient(patientId);
    }

    if (safetyRunId === undefined) {
      return subjectMedicationId === undefined
        ? this.safetyResultPort.getLatestForPatient(patientId)
        : this.safetyResultPort.getLatestForMedication(
            patientId,
            subjectMedicationId,
          );
    }

    const result = await this.safetyResultPort.getCurrentRunForPatient(
      patientId,
      safetyRunId,
    );

    if (
      result.subjectUserMedicationId !== undefined &&
      subjectMedicationId !== undefined &&
      result.subjectUserMedicationId !== subjectMedicationId
    ) {
      throw new Error(
        `Safety run "${result.runId}" does not match medication ${subjectMedicationId}`,
      );
    }
    return result;
  }

  private async loadMedications(
    patientId: number,
  ): Promise<PatientScopeMedication[]> {
    const rows = await this.db
      .select({
        userMedicationId: schema.userMedication.id,
        genericName: schema.medication.genericName,
        frequency: schema.userMedication.frequency,
        time: schema.scheduleTime.time,
      })
      .from(schema.userMedication)
      .innerJoin(
        schema.medication,
        eq(schema.userMedication.medicationId, schema.medication.id),
      )
      .leftJoin(
        schema.scheduleTime,
        eq(schema.scheduleTime.userMedicationId, schema.userMedication.id),
      )
      .where(
        and(
          eq(schema.userMedication.userId, patientId),
          eq(schema.userMedication.status, 'active'),
          eq(schema.userMedication.completion, 'ongoing'),
        ),
      );

    const byUserMedicationId = new Map<
      number,
      { genericName: string | null; frequency: number; slots: string[] }
    >();

    for (const row of rows) {
      const existing = byUserMedicationId.get(row.userMedicationId);
      if (existing) {
        if (row.time) existing.slots.push(row.time);
        continue;
      }
      byUserMedicationId.set(row.userMedicationId, {
        genericName: row.genericName,
        frequency: row.frequency,
        slots: row.time ? [row.time] : [],
      });
    }

    const medications: PatientScopeMedication[] = [];
    for (const {
      genericName,
      frequency,
      slots,
    } of byUserMedicationId.values()) {
      // PatientScopeMedication.ingredientName is documented as "never the
      // branded product name" — a medication entered without a generic
      // name (e.g. a manual entry that only captured the brand) can't
      // satisfy that honestly, so it's left out rather than silently
      // falling back to brandName and violating the contract.
      if (!genericName) {
        this.logger.warn(
          'Skipping a medication with no generic name from the patient scope (would otherwise leak the brand name as "ingredient name")',
        );
        continue;
      }
      medications.push({
        ingredientName: genericName,
        frequency,
        scheduleSlots: slots,
      });
    }

    return medications;
  }

  private async loadConditions(
    patientId: number,
  ): Promise<PatientScopeCondition[]> {
    const rows = await this.db
      .select({
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
          eq(schema.userChronicCondition.userId, patientId),
          eq(schema.userChronicCondition.isActive, true),
        ),
      );

    return rows.map((row) => ({ code: row.externalId, name: row.name }));
  }

  private async loadAllergies(
    patientId: number,
  ): Promise<PatientScopeCondition[]> {
    const rows = await this.db
      .select({
        name: schema.allergyConcept.name,
        externalId: schema.allergyConcept.externalId,
      })
      .from(schema.userAllergy)
      .innerJoin(
        schema.allergyConcept,
        eq(schema.userAllergy.allergyConceptId, schema.allergyConcept.id),
      )
      .where(
        and(
          eq(schema.userAllergy.userId, patientId),
          eq(schema.userAllergy.isActive, true),
        ),
      );

    return rows.map((row) => ({ code: row.externalId, name: row.name }));
  }
}
