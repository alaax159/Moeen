import { Injectable } from '@nestjs/common';

import {
  resolveSafetyState,
  SafetyCheckResult,
  SafetyCheckTrigger,
  SafetyCheckerCoverage,
  SafetyCheckerType,
  SafetyEvidenceRef,
  SafetyFinding,
} from '../../contracts';
import {
  PersistedSafetyRun,
  SafetyEngineRepository,
} from './safety-engine.repository';
import { SafetyResultPort } from './safety-result-adapter.port';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKER_TYPES: readonly SafetyCheckerType[] = [
  'drug_drug',
  'drug_allergy',
  'drug_condition',
  'duplicate_therapy',
];
const PERSISTED_TRIGGERS: readonly SafetyCheckTrigger[] = [
  'medication_added',
  'medication_updated',
  'dose_missed',
  'medication_archived',
  'allergy_updated',
  'condition_updated',
  'knowledge_updated',
  'label_updated',
  'manual_recheck',
  'active_review',
];

@Injectable()
export class SafetyResultAdapter implements SafetyResultPort {
  constructor(private readonly repo: SafetyEngineRepository) {}

  async getLatestForPatient(patientId: number): Promise<SafetyCheckResult> {
    const persisted = await this.repo.findLatestRunForPatient(patientId);
    return persisted
      ? this.toResult(persisted)
      : this.unverifiedResult(patientId);
  }

  async getLatestForMedication(
    patientId: number,
    subjectMedicationId: number,
  ): Promise<SafetyCheckResult> {
    const persisted = await this.repo.findLatestRunForMedication(
      patientId,
      subjectMedicationId,
    );
    return persisted
      ? this.toResult(persisted)
      : this.unverifiedResult(patientId);
  }

  async getCurrentRunForPatient(
    patientId: number,
    runId: string,
  ): Promise<SafetyCheckResult> {
    if (!UUID_RE.test(runId)) return this.unverifiedResult(patientId);
    const persisted = await this.repo.findCurrentRunForPatient(
      runId,
      patientId,
    );
    return persisted
      ? this.toResult(persisted)
      : this.unverifiedResult(patientId);
  }

  async getRunById(runId: string): Promise<SafetyCheckResult | null> {
    if (!UUID_RE.test(runId)) return null;
    const persisted = await this.repo.findRunById(runId);
    return persisted ? this.toResult(persisted) : null;
  }

  async getFindingById(
    findingId: string,
    patientId: number,
  ): Promise<SafetyCheckResult | null> {
    if (!UUID_RE.test(findingId)) return null;
    const persisted = await this.repo.findFindingById(findingId, patientId);
    return persisted ? this.toResult(persisted) : null;
  }

  getUnverifiedForPatient(patientId: number): SafetyCheckResult {
    return this.unverifiedResult(patientId);
  }

  private toResult(persisted: PersistedSafetyRun): SafetyCheckResult {
    const checkerEvidence = new Map<string, SafetyEvidenceRef[]>();
    const findingEvidence = new Map<string, SafetyEvidenceRef[]>();

    for (const evidence of persisted.evidence) {
      const target = evidence.findingId ? findingEvidence : checkerEvidence;
      const key = evidence.findingId ?? evidence.checkerResultId;
      const entries = target.get(key) ?? [];
      entries.push(this.toEvidenceRef(evidence));
      target.set(key, entries);
    }

    const coverageChecks: SafetyCheckerCoverage[] =
      persisted.checkerResults.map((checker) => ({
        checkerType: checker.checkerType,
        status: checker.status,
        ...(checker.reasonCode ? { reasonCode: checker.reasonCode } : {}),
        datasetVersions: checker.datasetVersions,
        evidence: checkerEvidence.get(checker.id) ?? [],
      }));
    const findings: SafetyFinding[] = persisted.findings.map((finding) => ({
      id: finding.id,
      findingKey: finding.findingKey,
      type: finding.findingType,
      severity: finding.severity,
      rationale: finding.rationale,
      subjectUserMedicationIds: [
        finding.primaryUserMedicationId,
        finding.interactingUserMedicationId,
      ].filter((id): id is number => id !== null),
      ...(finding.subjectUserAllergyId === null
        ? {}
        : { subjectUserAllergyId: finding.subjectUserAllergyId }),
      ...(finding.subjectUserConditionId === null
        ? {}
        : { subjectUserConditionId: finding.subjectUserConditionId }),
      evidence: findingEvidence.get(finding.id) ?? [],
    }));
    const resolved = resolveSafetyState(coverageChecks, findings);
    const requiredChecks = persisted.run.requiredChecks.map((checkerType) => {
      if (!CHECKER_TYPES.includes(checkerType as SafetyCheckerType)) {
        throw new Error(
          `Persisted safety run ${persisted.run.id} has unknown checker type "${checkerType}"`,
        );
      }
      return checkerType as SafetyCheckerType;
    });

    if (
      resolved.coverageStatus !== persisted.run.coverageStatus ||
      resolved.outcome !== persisted.run.outcome
    ) {
      throw new Error(
        `Persisted safety run ${persisted.run.id} violates its coverage/outcome invariant`,
      );
    }

    if (
      !PERSISTED_TRIGGERS.includes(persisted.run.trigger as SafetyCheckTrigger)
    ) {
      throw new Error(
        `Persisted safety run ${persisted.run.id} has invalid trigger "${persisted.run.trigger}"`,
      );
    }

    const completedAt = persisted.run.completedAt.toISOString();
    return {
      runId: persisted.run.id,
      id: persisted.run.id,
      patientId: persisted.run.userId,
      ...(persisted.run.subjectUserMedicationId === null
        ? {}
        : {
            subjectUserMedicationId: persisted.run.subjectUserMedicationId,
          }),
      trigger: persisted.run.trigger as SafetyCheckTrigger,
      requiredChecks,
      coverage: {
        status: persisted.run.coverageStatus,
        checks: coverageChecks,
      },
      outcome: persisted.run.outcome,
      engineVersion: persisted.run.engineVersion,
      datasetVersions: persisted.run.datasetVersions,
      contextHash: persisted.run.contextHash,
      startedAt: persisted.run.startedAt.toISOString(),
      completedAt,
      checkedAt: completedAt,
      severity: resolved.severity,
      findings,
    };
  }

  private toEvidenceRef(
    evidence: PersistedSafetyRun['evidence'][number],
  ): SafetyEvidenceRef {
    return {
      source: evidence.source,
      ...(evidence.sourceRecordId
        ? { sourceRecordId: evidence.sourceRecordId }
        : {}),
      ...(evidence.sourceVersion
        ? { sourceVersion: evidence.sourceVersion }
        : {}),
      ...(evidence.section ? { section: evidence.section } : {}),
      ...(evidence.uri ? { uri: evidence.uri } : {}),
      ...(evidence.contentHash ? { contentHash: evidence.contentHash } : {}),
      ...(evidence.details ? { details: evidence.details } : {}),
    };
  }

  private unverifiedResult(patientId: number): SafetyCheckResult {
    const checkedAt = new Date().toISOString();
    const runId = `no-safety-run-${patientId}`;
    return {
      runId,
      id: runId,
      patientId,
      trigger: 'manual_recheck',
      requiredChecks: [],
      coverage: { status: 'partial', checks: [] },
      outcome: 'unverified',
      engineVersion: 'none',
      datasetVersions: {},
      contextHash: 'none',
      startedAt: checkedAt,
      completedAt: checkedAt,
      checkedAt,
      severity: 'unverified',
      findings: [],
    };
  }
}
