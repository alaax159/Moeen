import { CitationProvenanceRule } from './citation-provenance.rule';
import { UncitedClaimRule } from './uncited-claim.rule';
import { LengthBoundRule } from './length-bound.rule';
import {
  candidate,
  testContext,
  CLEAN_ANSWER,
} from '../response-validator.fixtures';

describe('CitationProvenanceRule', () => {
  const rule = new CitationProvenanceRule();

  it('accepts ids that were really retrieved', () => {
    const violations = rule.check(
      candidate(CLEAN_ANSWER, ['chunk-a1', 'chunk-b2']),
      testContext(),
    );
    expect(violations).toEqual([]);
  });

  // The "done when" for this rule: validated against the actual retrieved set,
  // not a format. "chunk-c3" is indistinguishable from a real id by shape —
  // only membership of the true set catches it.
  it('rejects a well-formed id that was never retrieved', () => {
    const violations = rule.check(
      candidate(CLEAN_ANSWER, ['chunk-c3']),
      testContext({ suppliedCitationIds: ['chunk-a1', 'chunk-b2'] }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe('unknown_citation_id');
    expect(violations[0].evidence).toBe('chunk-c3');
  });

  it('rejects any citation at all when nothing was retrieved', () => {
    const violations = rule.check(
      candidate(CLEAN_ANSWER, ['chunk-a1']),
      testContext({ suppliedCitationIds: [] }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('no evidence was retrieved');
  });

  it('treats a near miss as a miss', () => {
    const violations = rule.check(
      candidate(CLEAN_ANSWER, ['CHUNK-A1', 'chunk-a1 ']),
      testContext({ suppliedCitationIds: ['chunk-a1'] }),
    );
    expect(violations).toHaveLength(2);
  });

  it('names every fabricated id, not just the first', () => {
    const violations = rule.check(
      candidate(CLEAN_ANSWER, ['chunk-x', 'chunk-y']),
      testContext(),
    );
    expect(violations.map((v) => v.evidence)).toEqual(['chunk-x', 'chunk-y']);
  });
});

describe('UncitedClaimRule', () => {
  const rule = new UncitedClaimRule();

  it('accepts a medicine claim that carries a citation', () => {
    expect(
      rule.check(
        candidate('This medicine is used to lower blood pressure.', [
          'chunk-a1',
        ]),
        testContext(),
      ),
    ).toEqual([]);
  });

  // A repeated sentence gets one grounding entry per occurrence. Keying them
  // by sentence text collapses the pair, so the uncited occurrence silently
  // inherits the cited one's citation and reaches the patient ungrounded.
  it('still rejects a repeated claim when one occurrence is uncited', () => {
    const claim = 'This medicine is used to lower blood pressure.';
    const text = `${claim} Take it with food. ${claim}`;

    const violations = rule.check(
      candidate(
        text,
        ['chunk-a1'],
        [
          { claim, citationIds: [] },
          { claim: 'Take it with food.', citationIds: ['chunk-a1'] },
          { claim, citationIds: ['chunk-a1'] },
        ],
      ),
      testContext(),
    );

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].code).toBe('uncited_medication_claim');
  });

  // The mirror case: collapsing in the other order must not invent a violation
  // against a claim that every occurrence actually cited.
  it('accepts a repeated claim when every occurrence is cited', () => {
    const claim = 'This medicine is used to lower blood pressure.';
    const text = `${claim} Take it with food. ${claim}`;

    expect(
      rule.check(
        candidate(
          text,
          ['chunk-a1'],
          [
            { claim, citationIds: ['chunk-a1'] },
            { claim: 'Take it with food.', citationIds: ['chunk-a1'] },
            { claim, citationIds: ['chunk-a1'] },
          ],
        ),
        testContext(),
      ),
    ).toEqual([]);
  });

  it('rejects a medicine claim with nothing cited', () => {
    const violations = rule.check(
      candidate('This medicine is used to lower blood pressure.', []),
      testContext(),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe('uncited_medication_claim');
  });

  it('rejects a confident uncited answer even when it sounds careful', () => {
    const violations = rule.check(
      candidate('Your medication can cause drowsiness in some people.', []),
      testContext(),
    );
    expect(violations).toHaveLength(1);
  });

  it('rejects an uncited medicine claim even when another sentence carries a valid citation', () => {
    const text =
      'This medicine is used to lower blood pressure. Your pharmacist can answer questions.';
    const violations = rule.check(
      candidate(
        text,
        ['chunk-a1'],
        [
          {
            claim: 'This medicine is used to lower blood pressure.',
            citationIds: [],
          },
          {
            claim: 'Your pharmacist can answer questions.',
            citationIds: ['chunk-a1'],
          },
        ],
      ),
      testContext(),
    );

    expect(violations).toEqual([
      expect.objectContaining({
        code: 'uncited_medication_claim',
        evidence: 'This medicine is used to lower blood pressure.',
      }),
    ]);
  });

  // The refusal the no-evidence template asks for: mentions medicines, asserts
  // nothing about them, cites nothing. It must survive, or the no-evidence
  // path can never produce an accepted answer.
  it('accepts an uncited answer that makes no claim', () => {
    expect(
      rule.check(
        candidate(
          'I do not have reference information I can rely on for this one, so I am not going to guess. Your doctor or pharmacist can answer it properly, and any decision about your medicines is theirs to make.',
          [],
        ),
        testContext({ suppliedCitationIds: [] }),
      ),
    ).toEqual([]);
  });

  it('does not pair a medicine in one sentence with a verb in another', () => {
    expect(
      rule.check(
        candidate(
          'Your pharmacist knows your medicines. A good night of sleep helps with most things.',
          [],
        ),
        testContext(),
      ),
    ).toEqual([]);
  });
});

describe('LengthBoundRule', () => {
  const rule = new LengthBoundRule();

  it('accepts a response inside the bound', () => {
    expect(
      rule.check(candidate('short'), testContext({ maxResponseChars: 100 })),
    ).toEqual([]);
  });

  it('rejects a response past the bound and says by how much', () => {
    const violations = rule.check(
      candidate('x'.repeat(101)),
      testContext({ maxResponseChars: 100 }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe('length_exceeded');
    expect(violations[0].detail).toContain('101 characters');
  });

  it('measures the patient-facing text, not the envelope', () => {
    expect(
      rule.check(
        candidate('x'.repeat(100), ['a'.repeat(500)]),
        testContext({ maxResponseChars: 100 }),
      ),
    ).toEqual([]);
  });
});
