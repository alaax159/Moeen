import { StubLlmProvider } from '../provider-gateway/stub-llm.provider';
import { testGenerationConfig } from '../provider-gateway/provider-gateway.fixtures';
import {
  envelope,
  REQUIRED_CLOSING,
  testValidator,
} from './response-validator.fixtures';

const SUPPLIED = ['chunk-a1', 'chunk-b2'];
const validator = testValidator();

/**
 * Tests in this file are sentence-level probes for individual validator rules.
 * Wrap each probe in an otherwise-complete response so the global closing
 * invariants do not obscure the rule the test is actually documenting.
 */
function verdictFor(text: string, citationIds: string[] = ['chunk-a1']) {
  const completeText = `${text} ${REQUIRED_CLOSING}`;

  return validator.validate({
    rawText: envelope(completeText, citationIds),
    suppliedCitationIds: SUPPLIED,
  });
}

function codesFor(text: string, citationIds?: string[]): string[] {
  const verdict = verdictFor(text, citationIds);
  return verdict.accepted ? [] : verdict.violations.map((v) => v.code);
}

/**
 * GN-3 T1 is done when "you've shown the team the false positives your
 * patterns produce". This file is that, kept executable rather than written
 * down once and left to rot.
 *
 * Every case below is sentence a careful writer might legitimately produce,
 * which this validator rejects anyway. They are recorded as passing tests
 * asserting the CURRENT behaviour, on purpose: when Alaa decides to loosen a
 * rule, the test that changes tells them precisely what they bought and what
 * they gave up. A red test here is a decision, not a regression.
 *
 * Ranked roughly by how likely each is to bite in production.
 */
describe('known false positives — deliberate over-rejection', () => {
  /**
   * #1 by a distance. Every missed-dose answer wants to say this, and the
   * intent this validator protects first is missed_dose. If DL-2 shows the
   * fallback more often than the generated text, this is why. Loosening it
   * means allowing the phrase "next dose", which is close to allowing the
   * answer to discuss the schedule at all — hence it is Alaa's call, not the
   * validator's default.
   */
  it('rejects a neutral mention of the next dose', () => {
    expect(
      codesFor('Your doctor can tell you about your next dose.'),
    ).toContain('schedule_change');
  });

  /**
   * #2. This is standard, good patient-safety copy — and it is still an
   * instruction about stopping a medicine, which limit 1 forbids outright.
   * Defensible to reject, painful to lose.
   */
  it('rejects "do not stop taking your medicine without asking"', () => {
    expect(
      codesFor(
        'Do not stop taking your medicine without talking to your doctor first.',
      ),
    ).toContain('schedule_change');
  });

  /**
   * #3. "caused by" is how a label excerpt describes a side effect, so this
   * fires on faithful, cited summaries of adverse-reaction sections. The
   * pattern requires a passive attribution rather than the bare words, which
   * limits it, but it will still fire on legitimate text.
   */
  it('rejects a cited side-effect summary phrased as attribution', () => {
    expect(
      codesFor('The label says drowsiness is caused by this medicine.'),
    ).toContain('diagnosis');
  });

  /**
   * #4. "in the morning" is a time of day whether or not the sentence is
   * about taking anything. Reflecting the patient's own words back at them
   * trips it.
   */
  it('rejects reflecting the patient\u2019s timing back to them', () => {
    expect(
      codesFor('You mentioned you noticed this in the morning.'),
    ).toContain('dosing_frequency');
  });

  /**
   * #5. A sentence opening with any dosing verb is treated as an imperative,
   * which catches ordinary idioms that begin with "take".
   */
  it('rejects a sentence that merely opens with "take"', () => {
    expect(codesFor('Take a look at the leaflet in the box.')).toContain(
      'schedule_change',
    );
  });

  /**
   * #6. "wears off" and "will pass" read as reassurance about how serious a
   * symptom is, which limit 2 forbids — even when the label says exactly that.
   */
  it('rejects a cited statement that an effect wears off', () => {
    expect(
      codesFor('The label notes that this effect usually wears off.'),
    ).toContain('diagnosis');
  });

  /**
   * #7. Counting anything trips the countable-unit pattern, because the
   * pattern cannot tell a count of tablets from a count of anything else
   * measured in the same nouns.
   */
  it('rejects counting excerpts rather than tablets', () => {
    expect(codesFor('There are two doses recorded for yesterday.')).toContain(
      'dose_amount',
    );
  });

  /**
   * #8. Latin shorthand is short. "od" and "bd" are unlikely as English words
   * but not impossible, and the abbreviation patterns are the cheapest thing
   * in the file to drop if they ever misfire.
   */
  it('is willing to read two-letter words as prescribing shorthand', () => {
    expect(codesFor('The note simply read bd.')).toContain('dosing_frequency');
  });
});

/**
 * The other half of the false-positive question: what the validator lets
 * through today that a stricter reading might not.
 */
describe('known gaps — deliberate under-rejection', () => {
  /**
   * The indefinite article in front of a countable unit. Documented in
   * number-words.ts: including it would reject "you missed a dose", which is
   * the single most common sentence a missed-dose answer contains.
   * The instruction form is still caught, by a different rule.
   */
  it('allows "a dose" but still catches the instruction around it', () => {
    expect(codesFor('You missed a dose yesterday.')).toEqual([]);
    expect(codesFor('Take a dose now.')).toContain('schedule_change');
  });

  /**
   * Condition vocabulary is unbounded, so the diagnosis rule matches frames
   * and keeps only a starter list of condition names. A flat assertion using
   * a condition outside that list, in a frame outside the list, gets through.
   * This is the known limit of a pattern-based approach and the reason T3's
   * red-team pass exists.
   */
  it('cannot catch every condition name in every frame', () => {
    expect(codesFor('Your dizziness is vestibular in origin.')).toEqual([]);
  });
});

/**
 * A grounding test, not a false positive: the stub provider is what Salam and
 * Islam develop against, and its canned replies were written to obey GN-1's
 * constraints. If this validator rejects them, either the stub is wrong or
 * the validator is too strict — and either way the whole team's local runs
 * would fall through to the fallback path and nobody would see real output.
 */
describe('the team\u2019s stub provider survives validation', () => {
  const stub = new StubLlmProvider(testGenerationConfig());

  async function stubReply(userPrompt: string) {
    return stub.generate(
      { systemPrompt: 'system', userPrompt },
      { signal: new AbortController().signal, maxOutputTokens: 700 },
    );
  }

  it('accepts the canned reply when evidence was supplied', async () => {
    const { text } = await stubReply(
      '[citation id: chunk-a1]\nLabel section: indications\nSome label text.',
    );

    expect(
      validator.validate({ rawText: text, suppliedCitationIds: SUPPLIED })
        .accepted,
    ).toBe(true);
  });

  it('accepts the canned refusal when no evidence was supplied', async () => {
    const { text } = await stubReply('No excerpts were supplied.');

    expect(
      validator.validate({ rawText: text, suppliedCitationIds: [] }).accepted,
    ).toBe(true);
  });
});
