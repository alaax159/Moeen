import { DosingFrequencyRule } from './dosing-frequency.rule';
import { candidate, CLEAN_ANSWER } from '../response-validator.fixtures';

const rule = new DosingFrequencyRule();
const fires = (text: string) => rule.check(candidate(text)).length > 0;

describe('DosingFrequencyRule', () => {
  it('lets a clean answer through', () => {
    expect(fires(CLEAN_ANSWER)).toBe(false);
  });

  it('catches a frequency written in digits', () => {
    expect(fires('It is taken 3 times a day.')).toBe(true);
    expect(fires('Every 8 hours is the usual pattern.')).toBe(true);
  });

  it('catches a frequency written in words', () => {
    expect(fires('It is taken twice a day.')).toBe(true);
    expect(fires('Once daily is usual for this one.')).toBe(true);
    expect(fires('Three times daily is what the label mentions.')).toBe(true);
    expect(fires('It is an every other day medicine.')).toBe(true);
  });

  it('catches prescribing shorthand', () => {
    expect(fires('The direction reads bd.')).toBe(true);
    expect(fires('It was written as q6h.')).toBe(true);
    expect(fires('Take prn.')).toBe(true);
  });

  it('catches a clock time', () => {
    expect(fires('Your dose is at 8pm.')).toBe(true);
    expect(fires('The slot is 08:00.')).toBe(true);
  });

  it('catches an administration time or circumstance', () => {
    expect(fires('It is usually taken at bedtime.')).toBe(true);
    expect(fires('This one is taken with food.')).toBe(true);
    expect(fires('It goes down best on an empty stomach.')).toBe(true);
  });

  it('catches a bare frequency adverb', () => {
    expect(fires('It is a medicine taken daily.')).toBe(true);
    expect(fires('This one is weekly.')).toBe(true);
  });

  // The one carve-out in T1. Narrow, named, and one array to delete.
  it('spares the non-clinical collocations of "daily"', () => {
    expect(fires('It should not get in the way of your daily life.')).toBe(
      false,
    );
    expect(fires('This can affect your daily routine.')).toBe(false);
    expect(fires('It varies from day to day.')).toBe(false);
  });
});
