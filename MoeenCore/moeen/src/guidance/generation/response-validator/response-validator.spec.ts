import { ResponseValidator } from './response-validator.service';
import { ValidationRejectionCode } from './validation-verdict';
import {
  envelope,
  groundEverySentence,
  testValidator,
  CLEAN_ANSWER,
  REQUIRED_CLOSING,
  REQUIRED_CLINICIAN_REFERRAL,
  REQUIRED_MEDICAL_HELP_SIGNPOST,
} from './response-validator.fixtures';

const SUPPLIED = ['chunk-a1', 'chunk-b2'];

function codesFor(
  validator: ResponseValidator,
  rawText: string,
  suppliedCitationIds: readonly string[] = SUPPLIED,
): ValidationRejectionCode[] {
  const verdict = validator.validate({ rawText, suppliedCitationIds });
  return verdict.accepted ? [] : verdict.violations.map((v) => v.code);
}

function withClosing(text: string): string {
  return `${text} ${REQUIRED_CLOSING}`;
}

describe('ResponseValidator', () => {
  const validator = testValidator();

  it('accepts a response that obeys every constraint', () => {
    const verdict = validator.validate({
      rawText: envelope(CLEAN_ANSWER, ['chunk-a1']),
      suppliedCitationIds: SUPPLIED,
    });

    expect(verdict).toEqual({
      accepted: true,
      text: CLEAN_ANSWER,
      citationIds: ['chunk-a1'],
    });
  });

  describe('each rule rejects on its own', () => {
    // One candidate per rule, clean in every other respect, so a failure here
    // points at exactly one rule rather than at whichever fired first.
    const cases: {
      name: string;
      raw: string;
      code: ValidationRejectionCode;
    }[] = [
      {
        name: 'a medicine claim with nothing cited',
        raw: envelope(
          withClosing('This medicine is used to lower blood pressure.'),
          [],
        ),
        code: 'uncited_medication_claim',
      },
      {
        name: 'a citation id that was never retrieved',
        raw: envelope(CLEAN_ANSWER, ['chunk-invented']),
        code: 'unknown_citation_id',
      },
      {
        name: 'a dose amount',
        raw: envelope(
          withClosing('The reference material mentions two tablets.'),
        ),
        code: 'dose_amount',
      },
      {
        name: 'a dosing frequency',
        raw: envelope(
          withClosing('The reference material mentions twice a day.'),
        ),
        code: 'dosing_frequency',
      },
      {
        name: 'a schedule change',
        raw: envelope(withClosing('You could skip it this once.')),
        code: 'schedule_change',
      },
      {
        name: 'a diagnosis',
        raw: envelope(withClosing('You have an infection.')),
        code: 'diagnosis',
      },
      {
        name: 'output past the length bound',
        raw: envelope(withClosing(`Thanks for asking. ${'a'.repeat(1300)}`)),
        code: 'length_exceeded',
      },
    ];

    it.each(cases)('rejects $name', ({ raw, code }) => {
      expect(codesFor(validator, raw)).toContain(code);
    });

    it.each(cases)('$name is not accepted', ({ raw }) => {
      expect(
        validator.validate({
          rawText: raw,
          suppliedCitationIds: SUPPLIED,
        }).accepted,
      ).toBe(false);
    });
  });

  it('rejects an otherwise-valid response that omits the required referral', () => {
    const raw = envelope(
      'Thanks for asking. I can explain the information provided here in plain language. ' +
        REQUIRED_MEDICAL_HELP_SIGNPOST,
      ['chunk-a1'],
    );

    expect(codesFor(validator, raw)).toContain('missing_referral');
  });

  it('rejects an otherwise-valid response that omits the standing medical-help signpost', () => {
    const raw = envelope(
      'Thanks for asking. I can explain the information provided here in plain language. ' +
        REQUIRED_CLINICIAN_REFERRAL,
      ['chunk-a1'],
    );

    expect(codesFor(validator, raw)).toContain('missing_medical_help_signpost');
  });

  describe('the envelope', () => {
    it('rejects text that is not JSON, rather than salvaging it', () => {
      expect(codesFor(validator, 'Sure! Here is my answer: take two.')).toEqual(
        ['malformed_envelope'],
      );
    });

    it('rejects a missing citationIds array rather than reading it as "no citations"', () => {
      expect(
        codesFor(validator, JSON.stringify({ text: CLEAN_ANSWER })),
      ).toEqual(['malformed_envelope']);
    });

    it('rejects a missing grounding map rather than trusting global citations', () => {
      expect(
        codesFor(
          validator,
          JSON.stringify({ text: CLEAN_ANSWER, citationIds: ['chunk-a1'] }),
        ),
      ).toEqual(['malformed_envelope']);
    });

    it('rejects an empty answer, because silence is not an answer', () => {
      expect(codesFor(validator, envelope('   '))).toEqual(['empty_response']);
      expect(codesFor(validator, '')).toEqual(['empty_response']);
    });

    // The one leniency in T1, and it is deliberate.
    it('tolerates a fenced JSON block', () => {
      const fenced = '```json\n' + envelope(CLEAN_ANSWER) + '\n```';

      expect(
        validator.validate({
          rawText: fenced,
          suppliedCitationIds: SUPPLIED,
        }).accepted,
      ).toBe(true);
    });
  });

  it('rejects a medicine claim whose citation was attached only to another sentence', () => {
    const claim = 'This medicine is used to lower blood pressure.';
    const raw = envelope(
      withClosing(claim),
      ['chunk-a1'],
      [
        { claim, citationIds: [] },
        ...groundEverySentence(REQUIRED_CLOSING, ['chunk-a1']),
      ],
    );

    expect(codesFor(validator, raw)).toEqual(['uncited_medication_claim']);
  });

  it('reports every violation in one pass, so a review sees the whole picture', () => {
    const codes = codesFor(
      validator,
      envelope(
        'Take two tablets twice a day. You have an infection. ' +
          REQUIRED_CLOSING,
        ['chunk-nope'],
      ),
    );

    expect(new Set(codes)).toEqual(
      new Set([
        'unknown_citation_id',
        'dose_amount',
        'dosing_frequency',
        'schedule_change',
        'diagnosis',
      ]),
    );
  });

  it('never edits — a rejected response yields no text at all', () => {
    const verdict = validator.validate({
      rawText: envelope('Take 10 mg now.'),
      suppliedCitationIds: SUPPLIED,
    });

    expect(verdict.accepted).toBe(false);
    expect(verdict).not.toHaveProperty('text');
  });

  it('takes the length bound from config', () => {
    const raw = envelope(
      `Thanks for asking. ${'a'.repeat(400)}. ${REQUIRED_CLOSING}`,
    );

    expect(codesFor(testValidator(), raw)).toEqual([]);

    expect(
      codesFor(testValidator({ VALIDATION_MAX_RESPONSE_CHARS: 100 }), raw),
    ).toEqual(['length_exceeded']);
  });
});
