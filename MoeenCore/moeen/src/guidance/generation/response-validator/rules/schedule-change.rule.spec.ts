import { ScheduleChangeRule } from './schedule-change.rule';
import { candidate, CLEAN_ANSWER } from '../response-validator.fixtures';

const rule = new ScheduleChangeRule();
const fires = (text: string) => rule.check(candidate(text)).length > 0;

describe('ScheduleChangeRule', () => {
  it('lets a clean answer through', () => {
    expect(fires(CLEAN_ANSWER)).toBe(false);
  });

  // The reason "change" is an object-taking verb rather than an unconditional
  // one. Every template ends with this sentence; an unconditional match would
  // reject every answer the pipeline ever produces.
  it('does not fire on the referral line the templates require', () => {
    expect(
      fires(
        'Whether anything about your medicines should change is a decision for your doctor or pharmacist.',
      ),
    ).toBe(false);
  });

  it('catches an unambiguous dosing verb wherever it appears', () => {
    expect(fires('Some people skip it when that happens.')).toBe(true);
    expect(fires('Doubling up is not a good idea.')).toBe(true);
    expect(fires('The tablet can be split.')).toBe(true);
  });

  it('catches an ambiguous verb once it acts on a medicine', () => {
    expect(fires('You should stop taking your medicine.')).toBe(true);
    expect(fires('Take it as soon as you can.')).toBe(true);
    expect(fires('Delay the next tablet.')).toBe(true);
  });

  it('catches an instruction frame around a verb', () => {
    expect(fires('You can safely wait for now.')).toBe(true);
    expect(fires('It is fine to continue.')).toBe(true);
    expect(fires('Do not stop.')).toBe(true);
    expect(fires('There is no need to take anything else.')).toBe(true);
  });

  it('catches a bare imperative sentence', () => {
    expect(fires('Wait until tomorrow.')).toBe(true);
    expect(fires('Just resume as normal.')).toBe(true);
  });

  // The highest-value catch for missed_dose: leaflet phrasing that names no
  // amount, no frequency and no verb the other rules watch for.
  it('catches missed-dose leaflet idioms', () => {
    expect(fires('Have it as soon as you remember.')).toBe(true);
    expect(fires('If it is almost time for the next one, leave it.')).toBe(
      true,
    );
    expect(fires('Never have a double dose.')).toBe(true);
    expect(fires('Go back to your usual pattern afterwards.')).toBe(true);
  });

  it('survives a curly apostrophe', () => {
    expect(fires('Don\u2019t stop taking it.')).toBe(true);
  });
});
