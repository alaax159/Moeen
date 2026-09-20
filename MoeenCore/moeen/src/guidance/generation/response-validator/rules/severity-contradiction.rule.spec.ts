import { safetyCheckResultFixtures } from '../../../__fixtures__';
import { candidate, testContext } from '../response-validator.fixtures';
import type { StoredSeverity } from '../validation-rule.port';
import { SeverityContradictionRule } from './severity-contradiction.rule';

const mixed = safetyCheckResultFixtures.mixedHighestWins;
const storedSeverity: StoredSeverity = {
  check: mixed.severity,
  findings: mixed.findings.map(({ type, severity }) => ({ type, severity })),
};

const context = testContext({ storedSeverity });

describe('SeverityContradictionRule', () => {
  const rule = new SeverityContradictionRule();

  it('rejects an overall downgrade even when that severity belongs to another finding', () => {
    const violations = rule.check(
      candidate('Overall, this is a minor issue.'),
      context,
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe('severity_contradiction');
  });

  it('does not turn an overall claim into a finding claim just by naming its cause', () => {
    const violations = rule.check(
      candidate('Overall, this is a minor duplicate therapy issue.'),
      context,
    );

    expect(violations).toHaveLength(1);
  });

  it('accepts different severities when each is tied to the matching finding', () => {
    const violations = rule.check(
      candidate(
        'The duplicate therapy finding is minor. The drug interaction finding is moderate. Overall, the check is major.',
      ),
      context,
    );

    expect(violations).toEqual([]);
  });

  it('does not let an unrelated minor finding validate a downgraded interaction', () => {
    const violations = rule.check(
      candidate('The drug interaction finding is minor.'),
      context,
    );

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('a finding');
  });

  it('still stands down when there was no stored safety check', () => {
    expect(
      rule.check(candidate('Overall, this is a minor issue.'), testContext()),
    ).toEqual([]);
  });
});
