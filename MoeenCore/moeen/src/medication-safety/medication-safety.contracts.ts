export const DRUG_DRUG_CHECKER = Symbol('DRUG_DRUG_CHECKER');
export const DRUG_ALLERGY_CHECKER = Symbol('DRUG_ALLERGY_CHECKER');
export const DRUG_CONDITION_CHECKER = Symbol('DRUG_CONDITION_CHECKER');

export type MedicationSafetyEventType =
  | 'dose_missed'
  | 'medication_added'
  | 'medication_updated'
  | 'medication_precheck'
  | 'active_review'
  | 'medication_archived'
  | 'allergy_updated'
  | 'condition_updated'
  | 'knowledge_updated'
  | 'label_updated'
  | 'manual_recheck';

// Identity of a not-yet-saved medication, used to run safety checks before a
// user_medication row exists.
export type MedicationSafetyDraft = {
  userId: number;
  medicationId: number | null;
  dailyMedId: string | null;
  rxcui?: string | null;
  brandName: string | null;
  genericName: string | null;
  verificationSource: 'palestine_moh' | 'dailymed' | 'rxnorm' | 'manual' | null;
  verificationStatus: 'verified' | 'unresolved';
};

export type PersistedMedicationSafetyEventType = Exclude<
  MedicationSafetyEventType,
  'medication_precheck'
>;

export type MedicationSafetyEvent = {
  type: MedicationSafetyEventType;
  /** Present for events tied to a persisted user_medication row. */
  userMedicationId?: number;
  /** Present only for medication_precheck. */
  draft?: MedicationSafetyDraft;
  /** Stable caller key (for example a dose-log id) used to deduplicate retries. */
  idempotencyKey?: string;
};

export type MedicationSafetyCheckType =
  'drug_drug' | 'drug_allergy' | 'drug_condition' | 'duplicate_therapy';

export type MedicationSafetyFindingSeverity =
  'minor' | 'moderate' | 'major' | 'contraindicated';

export type MedicationSafetySeverity =
  'unverified' | 'clear' | MedicationSafetyFindingSeverity;

export type MedicationSafetyCheckerStatus =
  'verified' | 'not_applicable' | 'partial' | 'unavailable' | 'failed';

export type MedicationSafetyCoverageStatus = 'complete' | 'partial' | 'failed';
export type MedicationSafetyOutcome = 'clear' | 'findings' | 'unverified';

export interface MedicationSafetyEvidence {
  source: string;
  sourceRecordId?: string;
  sourceVersion?: string;
  section?: string;
  uri?: string;
  contentHash?: string;
  details?: Record<string, unknown>;
  retrievedAt: Date;
}

/**
 * A checker observation. `unknown` is a coverage signal and is never stored
 * as a clinical finding or treated as proof that the regimen is safe.
 */
export type MedicationSafetyWarning = {
  warningType: MedicationSafetyCheckType;
  severity: string;
  message: string;
  subjectUserMedicationIds?: number[];
  subjectUserAllergyId?: number;
  subjectUserConditionId?: number;
  evidence?: MedicationSafetyEvidence[];

  // The allergy or condition name this warning is about. Absent for
  // drug_drug warnings, which involve two medications rather than one
  // named allergy/condition.
  affected?: string;

  // Which medication this warning is about. Stamped by
  // ActiveInteractionsService, which is the one place that knows which
  // medication's route() call produced a given warning.
  userMedicationId?: number;
};

export interface MedicationSafetyCheckerResult {
  checkerType: MedicationSafetyCheckType;
  status: MedicationSafetyCheckerStatus;
  reasonCode?: string;
  datasetVersions: Record<string, string>;
  evidence: MedicationSafetyEvidence[];
  checkedAt: Date;
  warnings: MedicationSafetyWarning[];
}

export interface MedicationSafetyContextSnapshot {
  userId: number;
  /** Monotonic fence used to reject runs invalidated by later patient edits. */
  contextVersion: number;
  subjectUserMedicationId: number;
  activeUserMedicationIds: number[];
  activeUserAllergyIds: number[];
  activeUserConditionIds: number[];
  activeMedications: Array<{
    userMedicationId: number;
    medicationId: number;
    genericName: string | null;
    brandName: string | null;
  }>;
  activeAllergies: Array<{
    userAllergyId: number;
    allergyConceptId: number;
    externalId: string | null;
    severity: string | null;
  }>;
  activeConditions: Array<{
    userConditionId: number;
    conditionConceptId: number;
    externalId: string | null;
  }>;
}

type MedicationSafetyResultBase = {
  safe: boolean;
  outcome: MedicationSafetyOutcome;
  coverageStatus: MedicationSafetyCoverageStatus;
  severity: MedicationSafetySeverity;
  warnings: MedicationSafetyWarning[];
  checkerResults: MedicationSafetyCheckerResult[];
};

export type PersistedMedicationSafetyResult = MedicationSafetyResultBase & {
  runId: string;
};

export type MedicationSafetyPrecheckResult = MedicationSafetyResultBase & {
  runId?: never;
};

export type MedicationSafetyResult =
  PersistedMedicationSafetyResult | MedicationSafetyPrecheckResult;

export interface MedicationSafetyRunDraft {
  subjectUserMedicationId: number;
  trigger: PersistedMedicationSafetyEventType;
  idempotencyKey: string;
  engineVersion: string;
  context: MedicationSafetyContextSnapshot;
  contextHash: string;
  startedAt: Date;
  completedAt: Date;
  requiredChecks: MedicationSafetyCheckType[];
  outcome: MedicationSafetyOutcome;
  coverageStatus: MedicationSafetyCoverageStatus;
  checkerResults: MedicationSafetyCheckerResult[];
}

export interface MedicationSafetyChecker {
  check(event: MedicationSafetyEvent): Promise<MedicationSafetyWarning[]>;
}
