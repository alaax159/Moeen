import {
  checkerMayAddFindings,
  checkerReplacesFindings,
  resolveCoverageStatus,
} from './safety-projection-policy';

describe('safety projection policy', () => {
  it.each(['verified', 'not_applicable'] as const)(
    '%s replaces the checker finding set',
    (status) => {
      expect(checkerReplacesFindings(status)).toBe(true);
    },
  );

  it.each(['partial', 'unavailable', 'failed'] as const)(
    '%s never removes previously verified findings',
    (status) => {
      expect(checkerReplacesFindings(status)).toBe(false);
    },
  );

  it('allows partial checks to add confirmed findings', () => {
    expect(checkerMayAddFindings('partial')).toBe(true);
    expect(checkerMayAddFindings('unavailable')).toBe(false);
    expect(checkerMayAddFindings('failed')).toBe(false);
  });

  it('only calls a run complete when every required checker completed', () => {
    expect(resolveCoverageStatus(['verified', 'not_applicable'])).toBe(
      'complete',
    );
    expect(resolveCoverageStatus(['verified', 'partial'])).toBe('partial');
    expect(resolveCoverageStatus(['failed', 'failed'])).toBe('failed');
  });
});
