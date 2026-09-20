import { ReferralRule } from './referral.rule';
import { candidate, CLEAN_ANSWER } from '../response-validator.fixtures';

const rule = new ReferralRule();

const fires = (text: string) => rule.check(candidate(text)).length > 0;

describe('ReferralRule', () => {
  it('lets the standard clean answer through', () => {
    expect(fires(CLEAN_ANSWER)).toBe(false);
  });

  it('rejects an answer with no clinician referral', () => {
    expect(
      fires(
        'The available information explains the concern in plain language. ' +
          'The detail is not available to me here.',
      ),
    ).toBe(true);
  });

  it('accepts an explicit doctor referral near the end', () => {
    expect(
      fires(
        'The available information explains the concern. ' +
          'Please discuss medicine decisions with your doctor.',
      ),
    ).toBe(false);
  });

  it('accepts an explicit pharmacist referral near the end', () => {
    expect(
      fires(
        'The available information explains the concern. ' +
          'Please contact your pharmacist about medicine decisions.',
      ),
    ).toBe(false);
  });

  it('accepts a contextual prefix before the affirmative referral', () => {
    expect(
      fires(
        'The available information explains the concern. ' +
          'When you can, please contact your doctor about this.',
      ),
    ).toBe(false);
  });

  it('accepts the deterministic decision-line referral form', () => {
    expect(
      fires(
        'The available information explains the concern. ' +
          'Whether anything about your medicines should change is a decision for your doctor or pharmacist.',
      ),
    ).toBe(false);
  });

  it('accepts a clinician-first help referral', () => {
    expect(
      fires(
        'The available information explains the concern. ' +
          'Your pharmacist can help with decisions about your medicines.',
      ),
    ).toBe(false);
  });

  it('accepts the clear-fallback clinician referral form', () => {
    expect(
      fires(
        'The latest medication safety check found nothing to flag. ' +
          'If anything about your medicines is worrying you, your doctor or pharmacist can help.',
      ),
    ).toBe(false);
  });

  it('does not count an early clinician mention as the closing referral', () => {
    expect(
      fires(
        'Your doctor was mentioned earlier. ' +
          'The available information describes the concern. ' +
          'The available detail ends here. ' +
          'This explanation is now complete.',
      ),
    ).toBe(true);
  });

  it('rejects a clinician identity disclaimer that is not a referral', () => {
    expect(
      fires(
        'The available information explains the concern. ' +
          'I am not your doctor. This is general information.',
      ),
    ).toBe(true);
  });

  it('rejects a directly negated pharmacist referral', () => {
    expect(
      fires(
        'The available information explains the concern. ' +
          'Do not contact your pharmacist about this.',
      ),
    ).toBe(true);
  });

  it('rejects a directly negated doctor referral', () => {
    expect(
      fires(
        'The available information explains the concern. ' +
          "You don't need to speak to your doctor about this.",
      ),
    ).toBe(true);
  });

  it('rejects "no reason to contact" even though it contains referral words', () => {
    expect(
      fires(
        'The available information explains the concern. ' +
          'There is no reason to contact your doctor about this.',
      ),
    ).toBe(true);
  });

  it('rejects a cannot-recommend referral wrapper', () => {
    expect(
      fires(
        'The available information explains the concern. ' +
          'I cannot recommend that you contact your pharmacist about this.',
      ),
    ).toBe(true);
  });

  it('rejects "would not ask" even though it contains an action and clinician', () => {
    expect(
      fires(
        'The available information explains the concern. ' +
          'I would not ask your doctor about this.',
      ),
    ).toBe(true);
  });

  it('still accepts a positive referral after a separate negative safety sentence', () => {
    expect(
      fires(
        'Do not make medicine changes based on this explanation. ' +
          'Please contact your doctor about medicine decisions.',
      ),
    ).toBe(false);
  });
});
