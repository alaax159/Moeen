import type { SafetyCheckSeverity } from './contracts';
import { ESCALATION_DIRECTIVE } from './escalation-directive';

const ALL_SEVERITIES: SafetyCheckSeverity[] = [
  'unverified',
  'clear',
  'minor',
  'moderate',
  'major',
  'contraindicated',
];

describe('ESCALATION_DIRECTIVE', () => {
  it('has a non-empty string entry for every SafetyCheckSeverity', () => {
    for (const severity of ALL_SEVERITIES) {
      expect(typeof ESCALATION_DIRECTIVE[severity]).toBe('string');
      expect(ESCALATION_DIRECTIVE[severity].trim().length).toBeGreaterThan(0);
    }
  });

  it('has exactly the six known severity keys and no extras', () => {
    expect(Object.keys(ESCALATION_DIRECTIVE).sort()).toEqual(
      [...ALL_SEVERITIES].sort(),
    );
  });
});
