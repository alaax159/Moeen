import type {
  GuidanceIntent,
  SafetyCheckResult,
  SafetyCheckSeverity,
  SafetyFinding,
} from '../../contracts';
import { safetyCheckResultFixtures } from '../../__fixtures__';
import { FallbackRenderer } from './fallback-renderer.service';
import {
  DECISION_LINE,
  INTENT_REFERRAL,
  MEDICAL_HELP_LINE,
  NO_ANSWER_HERE,
  NOTHING_FLAGGED,
  REFERRAL_LINE,
} from './fallback-copy';

const renderer = new FallbackRenderer();

const INTENTS: readonly GuidanceIntent[] = [
  'missed_dose',
  'explain_finding',
  'medication_question',
];

const SEVERITIES: readonly SafetyCheckSeverity[] = [
  'unverified',
  'clear',
  'minor',
  'moderate',
  'major',
  'contraindicated',
];

function result(
  severity: SafetyCheckSeverity,
  findings: SafetyFinding[],
): SafetyCheckResult {
  const checkedAt = '2026-08-01T09:00:00.000Z';
  const complete = severity !== 'unverified';
  return {
    runId: 'sc-test',
    id: 'sc-test',
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

function finding(overrides: Partial<SafetyFinding> = {}): SafetyFinding {
  return {
    type: 'drug_interaction',
    severity: 'moderate',
    rationale: 'Rationale written for a clinician, not for a patient.',
    subjectUserMedicationIds: [1, 2],
    evidence: [],
    ...overrides,
  };
}

type SafetyFixture =
  (typeof safetyCheckResultFixtures)[keyof typeof safetyCheckResultFixtures];

/** The shared fixtures are frozen literals; findings arrive here as a plain array. */
function fromFixture(fixture: SafetyFixture): SafetyCheckResult {
  const findings: SafetyFinding[] = fixture.findings.map(
    (entry: SafetyFinding) => ({
      ...entry,
      subjectUserMedicationIds: [...entry.subjectUserMedicationIds],
      evidence: [...entry.evidence],
    }),
  );

  return { ...fixture, findings };
}

describe('FallbackRenderer', () => {
  describe('what the patient is told', () => {
    it('names what was detected, the severity and the referral', () => {
      const { text } = renderer.render({
        intent: 'explain_finding',
        safety: fromFixture(safetyCheckResultFixtures.moderateInteraction),
      });

      expect(text).toContain('Medicine interaction');
      expect(text).toContain('rated moderate');
      expect(text).toContain(REFERRAL_LINE.moderate);
      expect(text).toContain(DECISION_LINE);
    });

    it('grades the referral by severity rather than by wording chosen per run', () => {
      const minor = renderer.render({
        intent: 'explain_finding',
        safety: result('minor', [finding({ severity: 'minor' })]),
      });
      const contraindicated = renderer.render({
        intent: 'explain_finding',
        safety: fromFixture(safetyCheckResultFixtures.contraindicatedPair),
      });

      expect(minor.text).toContain('at your next appointment');
      expect(contraindicated.text).toContain('today');
      expect(minor.text).toContain(MEDICAL_HELP_LINE);
      expect(contraindicated.text).toContain(MEDICAL_HELP_LINE);
    });

    it('tells a patient with no findings that nothing was flagged, and who to ask', () => {
      const { text } = renderer.render({
        intent: 'medication_question',
        safety: fromFixture(safetyCheckResultFixtures.clear),
      });

      expect(text).toContain(NOTHING_FLAGGED);
      expect(text).toContain(INTENT_REFERRAL.medication_question);
      expect(text).toContain(MEDICAL_HELP_LINE);
    });

    it.each(INTENTS)(
      'answers a run with no safety check at all (%s) with a referral rather than an error',
      (intent) => {
        const { text } = renderer.render({ intent, safety: null });

        expect(text).toContain(NO_ANSWER_HERE);
        expect(text).toContain(INTENT_REFERRAL[intent]);
        expect(text).toContain(MEDICAL_HELP_LINE);
        expect(text).toContain(DECISION_LINE);
        expect(text).not.toMatch(/error|sorry|failed|unavailable|try again/i);
      },
    );
  });

  describe('the deterministic layer decides, this only repeats it', () => {
    it('reports the severity the engine resolved, not one derived from the findings', () => {
      // Deliberately inconsistent: a contraindicated finding under a
      // 'moderate' resolved severity. Re-ranking here would be the generative
      // layer overruling the engine, which is the invariant this pipeline is
      // built around.
      const { text, severity } = renderer.render({
        intent: 'explain_finding',
        safety: result('moderate', [finding({ severity: 'contraindicated' })]),
      });

      expect(severity).toBe('moderate');
      expect(text).toContain('Overall, this check is rated moderate.');
      expect(text).not.toContain(
        'Overall, this check is rated contraindicated',
      );
      expect(text).toContain(REFERRAL_LINE.moderate);
    });

    it('keeps the pre-resolved severity of a mixed finding set', () => {
      const { text } = renderer.render({
        intent: 'explain_finding',
        safety: fromFixture(safetyCheckResultFixtures.mixedHighestWins),
      });

      expect(text).toContain('Overall, this check is rated major.');
    });

    it('never puts the engine rationale in front of a patient', () => {
      const { text } = renderer.render({
        intent: 'explain_finding',
        safety: result('major', [
          finding({
            severity: 'major',
            rationale: 'Warfarin 5 mg daily with aspirin - stop the aspirin.',
          }),
        ]),
      });

      expect(text).not.toContain('Warfarin');
      expect(text).not.toContain('5 mg');
      expect(text).not.toContain('stop the aspirin');
    });
  });

  describe('determinism', () => {
    it('renders identical text for identical input', () => {
      const safety = fromFixture(safetyCheckResultFixtures.mixedHighestWins);

      expect(
        renderer.render({ intent: 'explain_finding', safety }).text,
      ).toEqual(renderer.render({ intent: 'explain_finding', safety }).text);
    });

    it('does not depend on the order the engine returned findings in', () => {
      const safety = fromFixture(safetyCheckResultFixtures.mixedHighestWins);
      const reversed = { ...safety, findings: [...safety.findings].reverse() };

      expect(
        renderer.render({ intent: 'explain_finding', safety }).text,
      ).toEqual(
        renderer.render({ intent: 'explain_finding', safety: reversed }).text,
      );
    });

    it('collapses repeated finding types into one line carrying the count', () => {
      const { text, describedTypes } = renderer.render({
        intent: 'explain_finding',
        safety: result('major', [
          finding({ severity: 'minor' }),
          finding({ severity: 'major' }),
          finding({ severity: 'moderate' }),
        ]),
      });

      expect(describedTypes).toEqual(['drug_interaction']);
      expect(text).toContain('3 findings, highest rated major');
    });
  });

  describe('totality - the patient always gets something', () => {
    const combinations = INTENTS.flatMap((intent) =>
      SEVERITIES.map(
        (severity) =>
          [intent, severity] as [GuidanceIntent, SafetyCheckSeverity],
      ),
    );

    it.each(combinations)(
      'renders non-empty text for %s / %s',
      (intent, severity) => {
        const findings: SafetyFinding[] =
          severity === 'clear' || severity === 'unverified'
            ? []
            : [finding({ severity, type: 'allergy_conflict' })];

        const { text } = renderer.render({
          intent,
          safety: result(severity, findings),
        });

        expect(text.trim()).not.toEqual('');
        expect(text).toContain(MEDICAL_HELP_LINE);
        expect(text).toContain(DECISION_LINE);
      },
    );

    it('still describes a finding type it has no copy for', () => {
      const { text } = renderer.render({
        intent: 'explain_finding',
        safety: result('major', [
          finding({
            // The engine growing a fifth type is expected - SafetyFindingType
            // is marked PROVISIONAL in contracts/.
            type: 'photosensitivity' as SafetyFinding['type'],
            severity: 'major',
          }),
        ]),
      });

      expect(text).toContain('Another point was flagged');
      expect(text).toContain(REFERRAL_LINE.major);
    });

    it('omits the severity phrase rather than echoing a value it does not know', () => {
      const { text } = renderer.render({
        intent: 'explain_finding',
        safety: result('major', [
          finding({ severity: 'catastrophic' as SafetyFinding['severity'] }),
        ]),
      });

      expect(text).not.toContain('catastrophic');
      expect(text).toContain('Medicine interaction');
    });
  });

  it('stays inside the validator length bound with every finding type present', () => {
    const { text } = renderer.render({
      intent: 'explain_finding',
      safety: result('contraindicated', [
        finding({ type: 'allergy_conflict', severity: 'major' }),
        finding({ type: 'drug_interaction', severity: 'contraindicated' }),
        finding({ type: 'duplicate_therapy', severity: 'minor' }),
        finding({ type: 'condition_caution', severity: 'moderate' }),
        finding({ type: 'condition_caution', severity: 'minor' }),
      ]),
    });

    // Matches VALIDATION_CONFIG_DEFAULTS.VALIDATION_MAX_RESPONSE_CHARS. The
    // rule itself is exercised in the validator-safe spec; this asserts the
    // headroom, so a wordier lexicon fails here before it fails there.
    expect(text.length).toBeLessThan(1200);
  });
});
