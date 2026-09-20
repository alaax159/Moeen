import type {
  GuidanceIntent,
  SafetyCheckResult,
  SafetyCheckSeverity,
  SafetyFinding,
  SafetyFindingSeverity,
  SafetyFindingType,
} from '../../contracts';
import {
  envelope,
  testValidator,
} from '../response-validator/response-validator.fixtures';
import { summarizeViolations } from '../response-validator/validation-verdict';
import { FallbackRenderer } from './fallback-renderer.service';

/**
 * The fallback has to clear the bar it exists to enforce.
 *
 * Everything the validator rejects a model for - a dose, a frequency, a time
 * of day, an instruction about the patient's medicines, a diagnosis, a
 * judgement of urgency - is just as wrong coming from a template, and a
 * template is shown to a patient precisely when something already went wrong.
 * So every rendering the lexicon can produce is put through the real rules
 * here, with no citations supplied, which is the strictest configuration those
 * rules ever run in: with an empty citation list the uncited-claim rule is
 * live on every sentence.
 *
 * This is the test that catches a well-meaning copy edit. Rewrite a line in
 * fallback-copy.ts as "take it as normal until you speak to your doctor" and
 * this fails, naming the rule.
 */
const renderer = new FallbackRenderer();
const validator = testValidator();

const INTENTS: readonly GuidanceIntent[] = [
  'missed_dose',
  'explain_finding',
  'medication_question',
];

const TYPES: readonly SafetyFindingType[] = [
  'duplicate_therapy',
  'drug_interaction',
  'allergy_conflict',
  'condition_caution',
];

const FINDING_SEVERITIES: readonly SafetyFindingSeverity[] = [
  'minor',
  'moderate',
  'major',
  'contraindicated',
];

function check(
  severity: SafetyCheckSeverity,
  findings: SafetyFinding[],
): SafetyCheckResult {
  const checkedAt = '2026-08-01T09:00:00.000Z';
  const complete = severity !== 'unverified';
  return {
    runId: 'sc-validator-safe',
    id: 'sc-validator-safe',
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
    rationale: 'not rendered',
    subjectUserMedicationIds: [1, 2],
    evidence: [],
  };
}

/** Runs the fallback text through the validator exactly as model output would be. */
function expectAccepted(text: string): void {
  const verdict = validator.validate({
    rawText: envelope(text, []),
    suppliedCitationIds: [],
  });

  if (!verdict.accepted) {
    throw new Error(
      `Fallback text was rejected by our own validator (${summarizeViolations(
        verdict.violations,
      )}):\n${verdict.violations.map((v) => `  - ${v.rule}: ${v.detail}`).join('\n')}\n\nText:\n${text}`,
    );
  }

  expect(verdict.accepted).toBe(true);
}

describe('FallbackRenderer passes GN-3s own rules', () => {
  const singleFindingCases = TYPES.flatMap((type) =>
    FINDING_SEVERITIES.map(
      (severity) =>
        [type, severity] as [SafetyFindingType, SafetyFindingSeverity],
    ),
  );

  it.each(singleFindingCases)(
    'renders %s / %s as text the validator accepts',
    (type, severity) => {
      expectAccepted(
        renderer.render({
          intent: 'explain_finding',
          safety: check(severity, [finding(type, severity)]),
        }).text,
      );
    },
  );

  it.each(INTENTS)('renders the no-check answer for %s cleanly', (intent) => {
    expectAccepted(renderer.render({ intent, safety: null }).text);
  });

  it.each(INTENTS)(
    'renders the nothing-flagged answer for %s cleanly',
    (intent) => {
      expectAccepted(
        renderer.render({ intent, safety: check('clear', []) }).text,
      );
    },
  );

  it('renders the fullest possible answer cleanly, length bound included', () => {
    expectAccepted(
      renderer.render({
        intent: 'explain_finding',
        safety: check('contraindicated', [
          finding('allergy_conflict', 'major'),
          finding('allergy_conflict', 'minor'),
          finding('drug_interaction', 'contraindicated'),
          finding('duplicate_therapy', 'minor'),
          finding('condition_caution', 'moderate'),
        ]),
      }).text,
    );
  });

  it('renders an unknown finding type cleanly', () => {
    expectAccepted(
      renderer.render({
        intent: 'explain_finding',
        safety: check('major', [
          finding('photosensitivity' as SafetyFindingType, 'major'),
        ]),
      }).text,
    );
  });
});
