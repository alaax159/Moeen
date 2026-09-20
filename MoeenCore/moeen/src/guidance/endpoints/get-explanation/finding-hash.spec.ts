import { safetyCheckResultFixtures } from '../../__fixtures__';
import { SafetyCheckResult, SafetyFinding } from '../../contracts';
import { ExplanationCachePolicy, findingHash } from './finding-hash';

function finding(overrides: Partial<SafetyFinding> = {}): SafetyFinding {
  return {
    id: 'finding-1',
    findingKey: 'interaction:101:102',
    type: 'drug_interaction',
    severity: 'major',
    rationale: 'Warfarin and aspirin both increase bleeding risk.',
    subjectUserMedicationIds: [101, 102],
    evidence: [],
    ...overrides,
  };
}

function check(
  target: SafetyFinding,
  overrides: Partial<SafetyCheckResult> = {},
): SafetyCheckResult {
  return {
    ...safetyCheckResultFixtures.majorAllergyConflict,
    runId: 'run-1',
    id: 'run-1',
    contextHash: 'context-1',
    engineVersion: 'engine-1',
    datasetVersions: { rxnorm: '2026-08', openfda: '2026-07' },
    findings: [target],
    ...overrides,
  };
}

function hash(
  target: SafetyFinding = finding(),
  overrides: Partial<SafetyCheckResult> = {},
  policy?: ExplanationCachePolicy,
): string {
  return findingHash(check(target, overrides), target, policy);
}

describe('findingHash', () => {
  it('produces the same hash for the same run and finding content', () => {
    expect(hash()).toBe(hash());
  });

  it('is independent of medication, evidence and record-key ordering', () => {
    const first = finding({
      subjectUserMedicationIds: [101, 102],
      evidence: [
        { source: 'openfda', details: { z: 2, a: 1 } },
        { source: 'rxnorm' },
      ],
    });
    const second = finding({
      subjectUserMedicationIds: [102, 101],
      evidence: [
        { source: 'rxnorm' },
        { source: 'openfda', details: { a: 1, z: 2 } },
      ],
    });

    expect(
      findingHash(check(first, { datasetVersions: { b: '2', a: '1' } }), first),
    ).toBe(
      findingHash(
        check(second, { datasetVersions: { a: '1', b: '2' } }),
        second,
      ),
    );
  });

  it.each([
    ['severity', finding({ severity: 'minor' })],
    ['rationale', finding({ rationale: 'Different text.' })],
    ['medication subjects', finding({ subjectUserMedicationIds: [101, 103] })],
    ['finding type', finding({ type: 'duplicate_therapy' })],
  ])('changes when %s changes', (_label, changed) => {
    expect(hash()).not.toBe(hash(changed));
  });

  it.each([
    ['immutable run', { runId: 'run-2', id: 'run-2' }],
    ['patient context', { contextHash: 'context-2' }],
    ['engine version', { engineVersion: 'engine-2' }],
    ['dataset version', { datasetVersions: { rxnorm: '2026-09' } }],
  ] satisfies Array<[string, Partial<SafetyCheckResult>]>)(
    'changes when the %s changes',
    (_label, overrides) => {
      expect(hash()).not.toBe(hash(finding(), overrides));
    },
  );

  it('separately invalidates prompt and validation policy changes', () => {
    const oldPolicy: ExplanationCachePolicy = {
      promptVersion: 'gn1.1',
      validationPolicyVersion: 'gn3.1',
    };

    expect(hash(finding(), {}, oldPolicy)).not.toBe(
      hash(finding(), {}, { ...oldPolicy, promptVersion: 'gn1.2' }),
    );
    expect(hash(finding(), {}, oldPolicy)).not.toBe(
      hash(
        finding(),
        {},
        {
          ...oldPolicy,
          validationPolicyVersion: 'gn3.2',
        },
      ),
    );
  });
});
