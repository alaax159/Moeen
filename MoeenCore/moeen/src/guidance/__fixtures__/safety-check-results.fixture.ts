import type { SafetyCheckResult, SafetyFinding } from '../contracts';

const REQUIRED_CHECKS = [
  'drug_drug',
  'drug_allergy',
  'drug_condition',
] as const;

function completeResult(input: {
  runId: string;
  patientId: number;
  checkedAt: string;
  severity: SafetyCheckResult['severity'];
  findings: SafetyFinding[];
}): SafetyCheckResult {
  return {
    runId: input.runId,
    id: input.runId,
    patientId: input.patientId,
    trigger: 'manual_recheck',
    requiredChecks: REQUIRED_CHECKS,
    coverage: {
      status: 'complete',
      checks: REQUIRED_CHECKS.map((checkerType) => ({
        checkerType,
        status: 'verified' as const,
        datasetVersions: {},
        evidence: [],
      })),
    },
    outcome: input.findings.length === 0 ? 'clear' : 'findings',
    engineVersion: 'fixture-engine-v1',
    datasetVersions: {},
    contextHash: `fixture-${input.runId}`,
    startedAt: input.checkedAt,
    completedAt: input.checkedAt,
    checkedAt: input.checkedAt,
    severity: input.severity,
    findings: input.findings,
  };
}

const minorDuplicateFinding: SafetyFinding = {
  type: 'duplicate_therapy',
  severity: 'minor',
  rationale: 'Two NSAIDs are active in the current regimen at once.',
  subjectUserMedicationIds: [106, 107],
  evidence: [],
};

const moderateInteractionFinding: SafetyFinding = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'drug_interaction',
  severity: 'moderate',
  rationale:
    'Warfarin and aspirin both increase bleeding risk when taken together.',
  subjectUserMedicationIds: [101, 102],
  evidence: [],
};

const moderateConditionFinding: SafetyFinding = {
  type: 'condition_caution',
  severity: 'moderate',
  rationale:
    'NSAID use requires caution in patients with chronic kidney disease.',
  subjectUserMedicationIds: [106],
  evidence: [],
};

const majorAllergyFinding: SafetyFinding = {
  type: 'allergy_conflict',
  severity: 'major',
  rationale:
    'Patient has a recorded penicillin allergy; amoxicillin is a penicillin-class antibiotic.',
  subjectUserMedicationIds: [103],
  evidence: [],
};

const contraindicatedFinding: SafetyFinding = {
  type: 'drug_interaction',
  severity: 'contraindicated',
  rationale:
    'Sildenafil is contraindicated with nitrates due to severe hypotension risk.',
  subjectUserMedicationIds: [104, 105],
  evidence: [],
};

/**
 * The five cases the day-zero doc requires fixtures for. Every guidance
 * story tests against these instead of a real SafetyResultAdapter.
 */
export const safetyCheckResultFixtures = {
  clear: completeResult({
    runId: 'sc-clear-001',
    patientId: 1001,
    checkedAt: '2026-08-01T09:00:00.000Z',
    severity: 'clear',
    findings: [],
  }),

  moderateInteraction: completeResult({
    runId: 'sc-moderate-001',
    patientId: 1002,
    checkedAt: '2026-08-01T09:05:00.000Z',
    severity: 'moderate',
    findings: [moderateInteractionFinding],
  }),

  majorAllergyConflict: completeResult({
    runId: 'sc-major-001',
    patientId: 1003,
    checkedAt: '2026-08-01T09:10:00.000Z',
    severity: 'major',
    findings: [majorAllergyFinding],
  }),

  contraindicatedPair: completeResult({
    runId: 'sc-contraindicated-001',
    patientId: 1004,
    checkedAt: '2026-08-01T09:15:00.000Z',
    severity: 'contraindicated',
    findings: [contraindicatedFinding],
  }),

  // Four findings; the resolver has already picked 'major' as the highest
  // across them — this fixture exists to prove downstream code trusts that
  // pre-resolved severity rather than re-deriving it from the finding list.
  mixedHighestWins: completeResult({
    runId: 'sc-mixed-001',
    patientId: 1005,
    checkedAt: '2026-08-01T09:20:00.000Z',
    severity: 'major',
    findings: [
      minorDuplicateFinding,
      moderateInteractionFinding,
      moderateConditionFinding,
      majorAllergyFinding,
    ],
  }),
} as const satisfies Record<string, SafetyCheckResult>;
