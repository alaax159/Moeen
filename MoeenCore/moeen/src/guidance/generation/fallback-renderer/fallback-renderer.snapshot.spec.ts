import type {
  SafetyCheckResult,
  SafetyCheckSeverity,
  SafetyFinding,
  SafetyFindingSeverity,
  SafetyFindingType,
} from '../../contracts';
import { FallbackRenderer } from './fallback-renderer.service';

/**
 * The patient-facing text, in the repository, as text.
 *
 * These snapshots are here to be read rather than to catch a regression the
 * other specs would miss. The wording of a fallback is a clinical-copy
 * decision, and reviewing it in a diff of assertions is not the same as
 * reading the four paragraphs a patient actually gets. A snapshot that moves
 * is a copy change, and a copy change should be looked at by a person.
 */
const renderer = new FallbackRenderer();

function check(
  severity: SafetyCheckSeverity,
  findings: SafetyFinding[],
): SafetyCheckResult {
  const checkedAt = '2026-08-01T09:00:00.000Z';
  const complete = severity !== 'unverified';
  return {
    runId: 'sc-snapshot',
    id: 'sc-snapshot',
    patientId: 1,
    trigger: 'manual_recheck',
    requiredChecks: ['drug_drug'],
    coverage: {
      status: complete ? 'complete' : 'partial',
      checks: [
        {
          checkerType: 'drug_drug',
          status: complete ? 'verified' : 'unavailable',
          datasetVersions: {},
          evidence: [],
        },
      ],
    },
    outcome:
      severity === 'clear'
        ? 'clear'
        : severity === 'unverified'
          ? 'unverified'
          : 'findings',
    engineVersion: 'test',
    datasetVersions: {},
    contextHash: 'test',
    startedAt: checkedAt,
    completedAt: checkedAt,
    checkedAt,
    severity,
    findings,
  };
}

function finding(
  type: SafetyFindingType,
  severity: SafetyFindingSeverity,
): SafetyFinding {
  return {
    type,
    severity,
    rationale: 'clinical rationale, never rendered',
    subjectUserMedicationIds: [101, 102],
    evidence: [],
  };
}

describe('fallback text, as the patient reads it', () => {
  it('a moderate interaction', () => {
    expect(
      renderer.render({
        intent: 'explain_finding',
        safety: check('moderate', [finding('drug_interaction', 'moderate')]),
      }).text,
    ).toMatchSnapshot();
  });

  it('a contraindicated pair', () => {
    expect(
      renderer.render({
        intent: 'explain_finding',
        safety: check('contraindicated', [
          finding('drug_interaction', 'contraindicated'),
        ]),
      }).text,
    ).toMatchSnapshot();
  });

  it('a mixed check, highest severity already resolved by the engine', () => {
    expect(
      renderer.render({
        intent: 'medication_question',
        safety: check('major', [
          finding('duplicate_therapy', 'minor'),
          finding('drug_interaction', 'moderate'),
          finding('condition_caution', 'moderate'),
          finding('allergy_conflict', 'major'),
        ]),
      }).text,
    ).toMatchSnapshot();
  });

  it('a check that found nothing', () => {
    expect(
      renderer.render({
        intent: 'medication_question',
        safety: check('clear', []),
      }).text,
    ).toMatchSnapshot();
  });

  it('a missed-dose run with no check behind it', () => {
    expect(
      renderer.render({ intent: 'missed_dose', safety: null }).text,
    ).toMatchSnapshot();
  });
});
