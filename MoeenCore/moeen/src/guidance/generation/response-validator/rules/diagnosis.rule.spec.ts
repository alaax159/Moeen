import { DiagnosisRule } from './diagnosis.rule';
import { candidate, CLEAN_ANSWER } from '../response-validator.fixtures';

const rule = new DiagnosisRule();
const fires = (text: string) => rule.check(candidate(text)).length > 0;

describe('DiagnosisRule', () => {
  it('lets a clean answer through', () => {
    expect(fires(CLEAN_ANSWER)).toBe(false);
  });

  it('catches telling the patient what they have', () => {
    expect(fires('You have an allergic reaction to this.')).toBe(true);
    expect(fires('You may have high blood pressure.')).toBe(true);
    expect(fires('You are experiencing a side effect.')).toBe(true);
  });

  it('catches identifying what is happening', () => {
    expect(fires('That is a sign of an infection.')).toBe(true);
    expect(fires('This sounds like a reaction.')).toBe(true);
    expect(fires('It is probably a symptom of the interaction.')).toBe(true);
  });

  it('catches attributing a cause', () => {
    expect(fires('The tiredness is caused by this medicine.')).toBe(true);
    expect(fires('What you are feeling is the interaction at work.')).toBe(
      true,
    );
  });

  it('catches judging how serious a symptom is, in either direction', () => {
    expect(fires('It is nothing to worry about.')).toBe(true);
    expect(fires('That is perfectly normal.')).toBe(true);
    expect(fires('Go to the hospital.')).toBe(true);
    expect(fires('Seek urgent help.')).toBe(true);
  });

  // The distinction the whole rule rests on: a condition name inside a
  // diagnostic frame is a diagnosis; the same name in an indication drawn
  // from a cited excerpt is exactly what the templates permit.
  it('does not fire on an indication that names a condition', () => {
    expect(fires('This medicine is used to treat high blood pressure.')).toBe(
      false,
    );
    expect(fires('It is prescribed for people with asthma.')).toBe(false);
  });

  it('does not fire on the ordinary "if you have any questions" ending', () => {
    expect(fires('If you have any questions, ask your pharmacist.')).toBe(
      false,
    );
    expect(fires('You may have some concerns about this.')).toBe(false);
  });

  it('does not fire on the standing referral line', () => {
    expect(
      fires(
        'And if you feel unwell or something is worrying you, medical help is available now.',
      ),
    ).toBe(false);
  });
});
