import {
  resolveSafetyState,
  type SafetyCheckerCoverage,
  type SafetyFinding,
} from './safety-check-result.contract';

const verified: SafetyCheckerCoverage = {
  checkerType: 'drug_drug',
  status: 'verified',
  datasetVersions: { ddinter: '2026-08' },
  evidence: [],
};

describe('resolveSafetyState', () => {
  it('returns clear only for complete coverage with no findings', () => {
    expect(resolveSafetyState([verified], [])).toEqual({
      coverageStatus: 'complete',
      outcome: 'clear',
      severity: 'clear',
      safe: true,
    });
  });

  it.each(['partial', 'unavailable', 'failed'] as const)(
    'maps %s coverage without findings to unverified, never clear',
    (status) => {
      expect(resolveSafetyState([{ ...verified, status }], [])).toMatchObject({
        outcome: 'unverified',
        severity: 'unverified',
        safe: false,
      });
    },
  );

  it('retains confirmed finding severity alongside partial coverage', () => {
    const finding: SafetyFinding = {
      type: 'drug_interaction',
      severity: 'major',
      rationale: 'Confirmed by the deterministic checker.',
      subjectUserMedicationIds: [10, 11],
      evidence: [{ source: 'ddinter', sourceVersion: '2026-08' }],
    };

    expect(
      resolveSafetyState([{ ...verified, status: 'partial' }], [finding]),
    ).toEqual({
      coverageStatus: 'partial',
      outcome: 'findings',
      severity: 'major',
      safe: false,
    });
  });

  it('keeps mixed successful and failed checker coverage partial', () => {
    expect(
      resolveSafetyState(
        [verified, { ...verified, checkerType: 'drug_allergy', status: 'failed' }],
        [],
      ),
    ).toMatchObject({
      coverageStatus: 'partial',
      outcome: 'unverified',
      severity: 'unverified',
      safe: false,
    });
  });

  it('marks coverage failed only when every checker failed', () => {
    expect(
      resolveSafetyState(
        [
          { ...verified, status: 'failed' },
          { ...verified, checkerType: 'drug_allergy', status: 'failed' },
        ],
        [],
      ),
    ).toMatchObject({
      coverageStatus: 'failed',
      outcome: 'unverified',
    });
  });
});
