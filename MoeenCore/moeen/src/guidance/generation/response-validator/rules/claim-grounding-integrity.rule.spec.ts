import { candidate, testContext } from '../response-validator.fixtures';
import { ClaimGroundingIntegrityRule } from './claim-grounding-integrity.rule';

describe('ClaimGroundingIntegrityRule', () => {
  const rule = new ClaimGroundingIntegrityRule();
  const text =
    'This medicine is used for blood pressure. Ask your pharmacist for help.';

  it('accepts a complete sentence map whose citation summary is its exact union', () => {
    expect(
      rule.check(
        candidate(
          text,
          ['chunk-a1'],
          [
            {
              claim: 'This medicine is used for blood pressure.',
              citationIds: ['chunk-a1'],
            },
            {
              claim: 'Ask your pharmacist for help.',
              citationIds: [],
            },
          ],
        ),
        testContext(),
      ),
    ).toEqual([]);
  });

  it('rejects a missing sentence even when the global citation list looks valid', () => {
    const violations = rule.check(
      candidate(
        text,
        ['chunk-a1'],
        [
          {
            claim: 'Ask your pharmacist for help.',
            citationIds: ['chunk-a1'],
          },
        ],
      ),
      testContext(),
    );

    expect(violations.map((violation) => violation.code)).toContain(
      'invalid_claim_grounding',
    );
  });

  it('rejects grounding text that was not in the patient-facing response', () => {
    const violations = rule.check(
      candidate(
        text,
        ['chunk-a1'],
        [{ claim: text, citationIds: ['chunk-a1'] }],
      ),
      testContext(),
    );

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_claim_grounding' }),
      ]),
    );
  });

  it('requires an exact sentence copy rather than a normalized near-match', () => {
    const violations = rule.check(
      candidate(
        text,
        ['chunk-a1'],
        [
          {
            claim: 'This  medicine is used for blood pressure.',
            citationIds: ['chunk-a1'],
          },
          { claim: 'Ask your pharmacist for help.', citationIds: [] },
        ],
      ),
      testContext(),
    );

    expect(violations.map(({ code }) => code)).toContain(
      'invalid_claim_grounding',
    );
  });

  it('rejects a global citation not assigned to any claim', () => {
    const violations = rule.check(
      candidate(
        text,
        ['chunk-a1', 'chunk-b2'],
        [
          {
            claim: 'This medicine is used for blood pressure.',
            citationIds: ['chunk-a1'],
          },
          { claim: 'Ask your pharmacist for help.', citationIds: [] },
        ],
      ),
      testContext(),
    );

    expect(
      violations.some((violation) => /top-level/.test(violation.detail)),
    ).toBe(true);
  });

  it('rejects a grounded citation omitted from the global summary', () => {
    const violations = rule.check(
      candidate(
        text,
        [],
        [
          {
            claim: 'This medicine is used for blood pressure.',
            citationIds: ['chunk-a1'],
          },
          { claim: 'Ask your pharmacist for help.', citationIds: [] },
        ],
      ),
      testContext(),
    );

    expect(
      violations.some((violation) => /top-level/.test(violation.detail)),
    ).toBe(true);
  });
});
