import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DRIZZLE } from '../../database/database.constants';
import * as schema from '../../database/schema';
import type {
  MedicationSafetyCheckType,
  MedicationSafetyContextSnapshot,
  MedicationSafetyFindingSeverity,
  MedicationSafetyRunDraft,
  MedicationSafetyWarning,
} from '../medication-safety.contracts';
import {
  checkerMayAddFindings,
  checkerReplacesFindings,
  isCompleteCheckerStatus,
} from './safety-projection-policy';
import { syncSafetyWarningProjection } from './safety-warning-projection';

type Database = NodePgDatabase<typeof schema>;

type FindingRow = {
  id: string;
  checkerResultId: string;
  checkerType: MedicationSafetyCheckType;
  findingType:
    | 'drug_interaction'
    | 'allergy_conflict'
    | 'condition_caution'
    | 'duplicate_therapy';
  severity: MedicationSafetyFindingSeverity;
  rationale: string;
  affected: string | null;
  primaryUserMedicationId: number;
  interactingUserMedicationId: number | null;
  subjectUserAllergyId: number | null;
  subjectUserConditionId: number | null;
  findingKey: string;
  evidence: MedicationSafetyWarning['evidence'];
};

@Injectable()
export class MedicationSafetyRunRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async captureContext(
    subjectUserMedicationId: number,
  ): Promise<MedicationSafetyContextSnapshot> {
    const [subject] = await this.db
      .select({ userId: schema.userMedication.userId })
      .from(schema.userMedication)
      .where(
        and(
          eq(schema.userMedication.id, subjectUserMedicationId),
          eq(schema.userMedication.status, 'active'),
          eq(schema.userMedication.completion, 'ongoing'),
        ),
      )
      .limit(1);

    if (!subject) {
      throw new NotFoundException(
        `Active user medication ${subjectUserMedicationId} was not found`,
      );
    }

    const [medications, allergies, conditions, safetyState] = await Promise.all(
      [
        this.db
          .select({
            id: schema.userMedication.id,
            medicationId: schema.userMedication.medicationId,
            genericName: schema.medication.genericName,
            brandName: schema.medication.brandName,
          })
          .from(schema.userMedication)
          .innerJoin(
            schema.medication,
            eq(schema.userMedication.medicationId, schema.medication.id),
          )
          .where(
            and(
              eq(schema.userMedication.userId, subject.userId),
              eq(schema.userMedication.status, 'active'),
              eq(schema.userMedication.completion, 'ongoing'),
            ),
          )
          .orderBy(asc(schema.userMedication.id)),
        this.db
          .select({
            id: schema.userAllergy.id,
            allergyConceptId: schema.userAllergy.allergyConceptId,
            externalId: schema.allergyConcept.externalId,
            severity: schema.userAllergy.severity,
          })
          .from(schema.userAllergy)
          .innerJoin(
            schema.allergyConcept,
            eq(schema.userAllergy.allergyConceptId, schema.allergyConcept.id),
          )
          .where(
            and(
              eq(schema.userAllergy.userId, subject.userId),
              eq(schema.userAllergy.isActive, true),
            ),
          )
          .orderBy(asc(schema.userAllergy.id)),
        this.db
          .select({
            id: schema.userChronicCondition.id,
            conditionConceptId: schema.userChronicCondition.conditionConceptId,
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
              eq(schema.userChronicCondition.userId, subject.userId),
              eq(schema.userChronicCondition.isActive, true),
            ),
          )
          .orderBy(asc(schema.userChronicCondition.id)),
        this.db
          .select({ contextVersion: schema.patientSafetyState.contextVersion })
          .from(schema.patientSafetyState)
          .where(eq(schema.patientSafetyState.userId, subject.userId))
          .limit(1),
      ],
    );

    return {
      userId: subject.userId,
      contextVersion: safetyState[0]?.contextVersion ?? 0,
      subjectUserMedicationId,
      activeUserMedicationIds: medications.map(({ id }) => id),
      activeUserAllergyIds: allergies.map(({ id }) => id),
      activeUserConditionIds: conditions.map(({ id }) => id),
      activeMedications: medications.map(
        ({ id, medicationId, genericName, brandName }) => ({
          userMedicationId: id,
          medicationId,
          genericName,
          brandName,
        }),
      ),
      activeAllergies: allergies.map(
        ({ id, allergyConceptId, externalId, severity }) => ({
          userAllergyId: id,
          allergyConceptId,
          externalId,
          severity,
        }),
      ),
      activeConditions: conditions.map(
        ({ id, conditionConceptId, externalId }) => ({
          userConditionId: id,
          conditionConceptId,
          externalId,
        }),
      ),
    };
  }

  async persistRun(draft: MedicationSafetyRunDraft): Promise<string> {
    this.assertFindingOwnership(draft);

    return this.db.transaction(async (tx) => {
      const runId = randomUUID();
      const datasetVersions = Object.assign(
        {},
        ...draft.checkerResults.map((result) => result.datasetVersions),
      );
      const [insertedRun] = await tx
        .insert(schema.medicationSafetyRun)
        .values({
          id: runId,
          userId: draft.context.userId,
          subjectUserMedicationId: draft.subjectUserMedicationId,
          trigger: draft.trigger,
          requiredChecks: draft.requiredChecks,
          outcome: draft.outcome,
          coverageStatus: draft.coverageStatus,
          engineVersion: draft.engineVersion,
          datasetVersions,
          contextSnapshot: draft.context as unknown as Record<string, unknown>,
          contextHash: draft.contextHash,
          contextVersion: draft.context.contextVersion,
          idempotencyKey: draft.idempotencyKey,
          startedAt: draft.startedAt,
          completedAt: draft.completedAt,
        })
        .onConflictDoNothing({
          target: schema.medicationSafetyRun.idempotencyKey,
        })
        .returning({ id: schema.medicationSafetyRun.id });

      if (!insertedRun) {
        const [existing] = await tx
          .select({ id: schema.medicationSafetyRun.id })
          .from(schema.medicationSafetyRun)
          .where(
            eq(schema.medicationSafetyRun.idempotencyKey, draft.idempotencyKey),
          )
          .limit(1);

        if (!existing) {
          throw new Error('Safety run idempotency conflict could not be read');
        }
        return existing.id;
      }

      const checkerRows = draft.checkerResults.map((result) => ({
        id: randomUUID(),
        runId,
        checkerType: result.checkerType,
        status: result.status,
        reasonCode: result.reasonCode ?? null,
        datasetVersions: result.datasetVersions,
        checkedAt: result.checkedAt,
        source: result,
      }));

      await tx
        .insert(schema.medicationSafetyCheckerResult)
        .values(checkerRows.map(({ source: _source, ...row }) => row));

      const findingRows = checkerRows.flatMap((checker) =>
        checker.source.warnings
          .filter(
            (
              warning,
            ): warning is MedicationSafetyWarning & {
              severity: MedicationSafetyFindingSeverity;
            } => warning.severity !== 'unknown',
          )
          .map((warning) => this.toFindingRow(checker.id, warning)),
      );

      if (findingRows.length > 0) {
        await tx
          .insert(schema.medicationSafetyFinding)
          .values(
            findingRows.map(
              ({ checkerType: _checkerType, evidence: _evidence, ...row }) =>
                row,
            ),
          );
      }

      const evidenceRows = [
        ...checkerRows.flatMap((checker) =>
          checker.source.evidence.map((evidence) => ({
            checkerResultId: checker.id,
            findingId: null,
            ...evidence,
          })),
        ),
        ...findingRows.flatMap((finding) =>
          (finding.evidence ?? []).map((evidence) => ({
            checkerResultId: finding.checkerResultId,
            findingId: finding.id,
            ...evidence,
          })),
        ),
      ];

      if (evidenceRows.length > 0) {
        await tx.insert(schema.medicationSafetyEvidence).values(evidenceRows);
      }

      for (const checker of checkerRows) {
        const complete = isCompleteCheckerStatus(checker.status);
        const accepted = await tx
          .insert(schema.medicationSafetyCurrentCheck)
          .values({
            userId: draft.context.userId,
            subjectUserMedicationId: draft.subjectUserMedicationId,
            checkerType: checker.checkerType,
            latestCheckerResultId: checker.id,
            lastCompleteCheckerResultId: complete ? checker.id : null,
            latestStartedAt: draft.startedAt,
            updatedAt: draft.completedAt,
          })
          .onConflictDoUpdate({
            target: [
              schema.medicationSafetyCurrentCheck.subjectUserMedicationId,
              schema.medicationSafetyCurrentCheck.checkerType,
            ],
            set: {
              userId: draft.context.userId,
              latestCheckerResultId: checker.id,
              lastCompleteCheckerResultId: complete
                ? checker.id
                : sql`${schema.medicationSafetyCurrentCheck.lastCompleteCheckerResultId}`,
              latestStartedAt: draft.startedAt,
              updatedAt: draft.completedAt,
            },
            setWhere: lt(
              schema.medicationSafetyCurrentCheck.latestStartedAt,
              draft.startedAt,
            ),
          })
          .returning({
            latestCheckerResultId:
              schema.medicationSafetyCurrentCheck.latestCheckerResultId,
          });

        if (accepted.length === 0) continue;

        if (checkerReplacesFindings(checker.status)) {
          await tx
            .delete(schema.medicationSafetyCurrentFinding)
            .where(
              and(
                eq(
                  schema.medicationSafetyCurrentFinding.subjectUserMedicationId,
                  draft.subjectUserMedicationId,
                ),
                eq(
                  schema.medicationSafetyCurrentFinding.checkerType,
                  checker.checkerType,
                ),
              ),
            );
        }

        if (!checkerMayAddFindings(checker.status)) continue;

        for (const finding of findingRows.filter(
          (row) => row.checkerResultId === checker.id,
        )) {
          await tx
            .insert(schema.medicationSafetyCurrentFinding)
            .values({
              userId: draft.context.userId,
              subjectUserMedicationId: draft.subjectUserMedicationId,
              checkerType: checker.checkerType,
              findingKey: finding.findingKey,
              findingId: finding.id,
              updatedAt: draft.completedAt,
            })
            .onConflictDoUpdate({
              target: [
                schema.medicationSafetyCurrentFinding.subjectUserMedicationId,
                schema.medicationSafetyCurrentFinding.checkerType,
                schema.medicationSafetyCurrentFinding.findingKey,
              ],
              set: {
                findingId: finding.id,
                updatedAt: draft.completedAt,
              },
            });
        }
      }

      await syncSafetyWarningProjection(
        tx,
        draft.subjectUserMedicationId,
        draft.completedAt,
      );

      return runId;
    });
  }

  hashContext(context: MedicationSafetyContextSnapshot): string {
    return this.hash(context as unknown as Record<string, unknown>);
  }

  private toFindingRow(
    checkerResultId: string,
    warning: MedicationSafetyWarning & {
      severity: MedicationSafetyFindingSeverity;
    },
  ): FindingRow {
    const subjectIds = warning.subjectUserMedicationIds ?? [];
    const primaryUserMedicationId = subjectIds[0];
    if (primaryUserMedicationId === undefined) {
      throw new Error('A persisted safety finding must name its medication');
    }

    const findingKey = this.hash({
      type: warning.warningType,
      medications: [...subjectIds].sort((a, b) => a - b),
      allergy: warning.subjectUserAllergyId ?? null,
      condition: warning.subjectUserConditionId ?? null,
    });

    return {
      id: randomUUID(),
      checkerResultId,
      checkerType: warning.warningType,
      findingType: this.toFindingType(warning.warningType),
      severity: warning.severity,
      rationale: warning.message,
      affected: warning.affected ?? null,
      primaryUserMedicationId,
      interactingUserMedicationId: subjectIds[1] ?? null,
      subjectUserAllergyId: warning.subjectUserAllergyId ?? null,
      subjectUserConditionId: warning.subjectUserConditionId ?? null,
      findingKey,
      evidence: warning.evidence,
    };
  }

  private assertFindingOwnership(draft: MedicationSafetyRunDraft): void {
    const medicationIds = new Set(draft.context.activeUserMedicationIds);
    const allergyIds = new Set(draft.context.activeUserAllergyIds);
    const conditionIds = new Set(draft.context.activeUserConditionIds);

    for (const warning of draft.checkerResults.flatMap(
      (result) => result.warnings,
    )) {
      for (const medicationId of warning.subjectUserMedicationIds ?? []) {
        if (!medicationIds.has(medicationId)) {
          throw new Error(
            `Safety finding medication ${medicationId} is outside the captured patient context`,
          );
        }
      }
      if (
        warning.subjectUserAllergyId !== undefined &&
        !allergyIds.has(warning.subjectUserAllergyId)
      ) {
        throw new Error(
          'Safety finding allergy is outside the patient context',
        );
      }
      if (
        warning.subjectUserConditionId !== undefined &&
        !conditionIds.has(warning.subjectUserConditionId)
      ) {
        throw new Error(
          'Safety finding condition is outside the patient context',
        );
      }
    }
  }

  private toFindingType(checkerType: MedicationSafetyCheckType) {
    switch (checkerType) {
      case 'drug_drug':
        return 'drug_interaction' as const;
      case 'drug_allergy':
        return 'allergy_conflict' as const;
      case 'drug_condition':
        return 'condition_caution' as const;
      case 'duplicate_therapy':
        return 'duplicate_therapy' as const;
    }
  }

  private hash(value: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
