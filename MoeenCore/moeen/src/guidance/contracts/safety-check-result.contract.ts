export type SafetyCheckerType =
  'drug_drug' | 'drug_allergy' | 'drug_condition' | 'duplicate_therapy';

export type SafetyCheckerStatus =
  'verified' | 'not_applicable' | 'partial' | 'unavailable' | 'failed';

export type SafetyCoverageStatus = 'complete' | 'partial' | 'failed';

export type SafetyCheckTrigger =
  | 'medication_added'
  | 'medication_updated'
  | 'dose_missed'
  | 'medication_archived'
  | 'allergy_updated'
  | 'condition_updated'
  | 'knowledge_updated'
  | 'label_updated'
  | 'manual_recheck'
  | 'active_review';

export type SafetyFindingType =
  | 'duplicate_therapy'
  | 'drug_interaction'
  | 'allergy_conflict'
  | 'condition_caution';

export type SafetyFindingSeverity =
  'minor' | 'moderate' | 'major' | 'contraindicated';

/**
 * `unverified` is not a clinical severity. It is the explicit result when no
 * confirmed finding exists but one or more required checkers did not finish.
 */
export type SafetyCheckSeverity =
  'unverified' | 'clear' | SafetyFindingSeverity;

export type SafetyCheckOutcome = 'clear' | 'findings' | 'unverified';

export interface SafetyEvidenceRef {
  source: string;
  sourceRecordId?: string;
  sourceVersion?: string;
  section?: string;
  uri?: string;
  contentHash?: string;
  details?: Readonly<Record<string, unknown>>;
}

export interface SafetyFinding {
  id?: string;
  findingKey?: string;
  type: SafetyFindingType;
  severity: SafetyFindingSeverity;
  rationale: string;
  /** IDs from user_medication, never catalog medication IDs. */
  subjectUserMedicationIds: number[];
  subjectUserAllergyId?: number;
  subjectUserConditionId?: number;
  evidence: readonly SafetyEvidenceRef[];
}

export interface SafetyCheckerCoverage {
  checkerType: SafetyCheckerType;
  status: SafetyCheckerStatus;
  reasonCode?: string;
  datasetVersions: Readonly<Record<string, string>>;
  evidence: readonly SafetyEvidenceRef[];
}

export interface SafetyCoverage {
  status: SafetyCoverageStatus;
  checks: readonly SafetyCheckerCoverage[];
}

export interface SafetyCheckResult {
  /** Immutable medication_safety_run identifier. */
  runId: string;
  /** @deprecated Compatibility alias; always equal to runId. */
  id: string;
  patientId: number;
  subjectUserMedicationId?: number;
  trigger: SafetyCheckTrigger;
  requiredChecks: readonly SafetyCheckerType[];
  coverage: SafetyCoverage;
  outcome: SafetyCheckOutcome;
  engineVersion: string;
  datasetVersions: Readonly<Record<string, string>>;
  contextHash: string;
  startedAt: string;
  completedAt: string;
  /** @deprecated Compatibility alias; always equal to completedAt. */
  checkedAt: string;
  /** Pre-resolved by the deterministic engine. */
  severity: SafetyCheckSeverity;
  findings: SafetyFinding[];
}

/** Patient-safe subset supplied to generation and validation. */
export interface SafetyCheckSummary {
  runId: string;
  coverage: SafetyCoverage;
  severity: SafetyCheckSeverity;
  findings: readonly SafetyFinding[];
}

export const CLINICAL_SEVERITY_ORDER: readonly SafetyFindingSeverity[] = [
  'minor',
  'moderate',
  'major',
  'contraindicated',
];

export interface ResolvedSafetyState {
  coverageStatus: SafetyCoverageStatus;
  outcome: SafetyCheckOutcome;
  severity: SafetyCheckSeverity;
  safe: boolean;
}

/**
 * The single resolver for the cross-layer safety invariant. `clear` is only
 * possible when every required checker is verified/not-applicable and there
 * are no findings. A coverage failure can therefore never be presented as a
 * clean bill of health.
 */
export function resolveSafetyState(
  checks: readonly SafetyCheckerCoverage[],
  findings: readonly SafetyFinding[],
): ResolvedSafetyState {
  const isComplete =
    checks.length > 0 &&
    checks.every(
      (check) =>
        check.status === 'verified' || check.status === 'not_applicable',
    );
  const allFailed =
    checks.length > 0 &&
    checks.every((check) => check.status === 'failed');
  const coverageStatus: SafetyCoverageStatus = isComplete
    ? 'complete'
    : allFailed
      ? 'failed'
      : 'partial';

  if (findings.length > 0) {
    const severity = findings.reduce<SafetyFindingSeverity>(
      (highest, finding) =>
        CLINICAL_SEVERITY_ORDER.indexOf(finding.severity) >
        CLINICAL_SEVERITY_ORDER.indexOf(highest)
          ? finding.severity
          : highest,
      findings[0].severity,
    );
    return {
      coverageStatus,
      outcome: 'findings',
      severity,
      safe: false,
    };
  }

  if (isComplete) {
    return {
      coverageStatus,
      outcome: 'clear',
      severity: 'clear',
      safe: true,
    };
  }

  return {
    coverageStatus,
    outcome: 'unverified',
    severity: 'unverified',
    safe: false,
  };
}
