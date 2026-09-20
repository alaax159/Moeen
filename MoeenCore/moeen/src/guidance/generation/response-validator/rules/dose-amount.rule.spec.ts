import { DoseAmountRule } from './dose-amount.rule';
import { candidate, CLEAN_ANSWER } from '../response-validator.fixtures';

const rule = new DoseAmountRule();
const fires = (text: string) => rule.check(candidate(text)).length > 0;

describe('DoseAmountRule', () => {
  it('lets a clean answer through', () => {
    expect(fires(CLEAN_ANSWER)).toBe(false);
  });

  it('catches a dose written in digits', () => {
    expect(fires('The usual amount is 10 mg.')).toBe(true);
    expect(fires('It comes as 500mg tablets.')).toBe(true);
    expect(fires('That is 2.5 ml of the liquid.')).toBe(true);
  });

  // The line GN-3 singles out: a dose spelled out is the same instruction and
  // the same risk, and `\d` does not see it.
  it('catches a dose written in words', () => {
    expect(fires('Take two tablets with water.')).toBe(true);
    expect(fires('That is half a tablet.')).toBe(true);
    expect(fires('You would have a couple of capsules left.')).toBe(true);
    expect(fires('It is ten milligrams.')).toBe(true);
    expect(fires('One and a half tablets is the usual amount.')).toBe(true);
  });

  it('catches typographic and range forms', () => {
    expect(fires('Take \u00BD tablet.')).toBe(true);
    expect(fires('The range is 10 to 20 mg.')).toBe(true);
    expect(fires('It is a 2% cream.')).toBe(true);
    expect(fires('The strength is 500mg/5ml.')).toBe(true);
  });

  it('catches a measurement unit even with no number attached', () => {
    expect(fires('Your doctor decides how many milligrams you need.')).toBe(
      true,
    );
  });

  it('catches a dose named by its size', () => {
    expect(fires('A dose of two is what the label mentions.')).toBe(true);
  });

  // Deliberate gap, documented in the README: "a dose"/"a tablet" is ordinary
  // English that missed-dose answers produce constantly, and the instruction
  // form of it is caught by the schedule-change rule instead.
  it('does not fire on an indefinite article in front of a countable unit', () => {
    expect(fires('You missed a dose yesterday.')).toBe(false);
    expect(fires('Your medicine comes as a tablet.')).toBe(false);
  });

  it('reports every distinct amount it found, not just the first', () => {
    const violations = rule.check(
      candidate('It is 10 mg, and the other is two tablets.'),
    );
    expect(violations.length).toBeGreaterThanOrEqual(2);
    expect(violations.every((v) => v.code === 'dose_amount')).toBe(true);
  });

  it('quotes what it matched, so a reviewer can judge the rule', () => {
    const [violation] = rule.check(candidate('It is 10 mg.'));
    expect(violation.evidence).toContain('10 mg');
    expect(violation.detail).toContain('10 mg');
  });
});
