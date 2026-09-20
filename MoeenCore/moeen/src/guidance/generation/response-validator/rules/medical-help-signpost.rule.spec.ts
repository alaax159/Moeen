import { MedicalHelpSignpostRule } from './medical-help-signpost.rule';
import { candidate, CLEAN_ANSWER } from '../response-validator.fixtures';

const rule = new MedicalHelpSignpostRule();

const fires = (text: string) => rule.check(candidate(text)).length > 0;

describe('MedicalHelpSignpostRule', () => {
  it('lets the standard clean answer through', () => {
    expect(fires(CLEAN_ANSWER)).toBe(false);
  });

  it('rejects an otherwise-valid doctor referral without the standing signpost', () => {
    expect(
      fires(
        'The available information explains the concern. ' +
          'Please discuss medicine decisions with your doctor.',
      ),
    ).toBe(true);
  });

  it('accepts the required standing signpost near the end', () => {
    expect(
      fires(
        'Please discuss medicine decisions with your doctor. ' +
          'If you feel unwell or something is worrying you, medical help is available now.',
      ),
    ).toBe(false);
  });

  it('rejects a paraphrased signpost because the contract says not to vary it', () => {
    expect(
      fires(
        'Please discuss medicine decisions with your doctor. ' +
          'If you are worried, seek medical support.',
      ),
    ).toBe(true);
  });

  it('does not count an early signpost as satisfying the required closing', () => {
    expect(
      fires(
        'If you feel unwell or something is worrying you, medical help is available now. ' +
          'The available information explains the concern. ' +
          'This explanation is now complete.',
      ),
    ).toBe(true);
  });
});
