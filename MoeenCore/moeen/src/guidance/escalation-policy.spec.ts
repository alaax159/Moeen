import type { SafetyCheckSeverity, SafetyFindingSeverity } from './contracts';
import {
  ESCALATION_THRESHOLD,
  meetsEscalationThreshold,
  severityMeetsThreshold,
} from './escalation-policy';

const ALL_SEVERITIES: SafetyCheckSeverity[] = [
  'unverified',
  'clear',
  'minor',
  'moderate',
  'major',
  'contraindicated',
];

const THRESHOLDS: SafetyFindingSeverity[] = [
  'minor',
  'moderate',
  'major',
  'contraindicated',
];

// Independent reference ranking so the test doesn't lean on the impl's own array.
const CLINICAL_ORDER = ['minor', 'moderate', 'major', 'contraindicated'];
const expectedMeets = (
  severity: SafetyCheckSeverity,
  threshold: SafetyFindingSeverity | null,
): boolean => {
  if (threshold === null) return false;
  const s = CLINICAL_ORDER.indexOf(severity);
  return s !== -1 && s >= CLINICAL_ORDER.indexOf(threshold);
};

describe('severityMeetsThreshold', () => {
  it('returns false for every severity when the threshold is null', () => {
    for (const severity of ALL_SEVERITIES) {
      expect(severityMeetsThreshold(severity, null)).toBe(false);
    }
  });

  describe.each(THRESHOLDS)('threshold = %s', (threshold) => {
    it.each(ALL_SEVERITIES)('severity %s', (severity) => {
      expect(severityMeetsThreshold(severity, threshold)).toBe(
        expectedMeets(severity, threshold),
      );
    });
  });

  it('is true only at or above the threshold', () => {
    expect(severityMeetsThreshold('moderate', 'major')).toBe(false);
    expect(severityMeetsThreshold('major', 'major')).toBe(true);
    expect(severityMeetsThreshold('contraindicated', 'major')).toBe(true);
  });

  it("never fires for the non-clinical severities 'clear' / 'unverified'", () => {
    for (const threshold of THRESHOLDS) {
      expect(severityMeetsThreshold('clear', threshold)).toBe(false);
      expect(severityMeetsThreshold('unverified', threshold)).toBe(false);
    }
  });
});

describe('meetsEscalationThreshold (live constant)', () => {
  it('ESCALATION_THRESHOLD is null — the gate stays disabled until clinical sign-off', () => {
    expect(ESCALATION_THRESHOLD).toBeNull();
  });

  it('returns false for every severity while ESCALATION_THRESHOLD is null', () => {
    for (const severity of ALL_SEVERITIES) {
      expect(meetsEscalationThreshold(severity)).toBe(false);
    }
  });
});
