import { CandidateResponse } from '../candidate-response';
import { ValidationRule } from '../validation-rule.port';
import { ValidationViolation } from '../validation-verdict';
import { splitSentences } from './text-utils';

/**
 * The shared prompt contract requires the same standing medical-help signpost
 * in every generated answer.
 *
 * It is deliberately a separate rule from ReferralRule:
 *
 * - ReferralRule proves the patient is affirmatively directed to a clinician.
 * - This rule proves the standing "medical help is available now" signpost is
 *   also present.
 *
 * The prompt explicitly says not to vary or omit this wording.
 */

const REQUIRED_SIGNPOST =
  /\bif\s+you\s+feel\s+unwell\s+or\s+something\s+is\s+worrying\s+you,?\s+medical\s+help\s+is\s+available\s+now\b/i;

export class MedicalHelpSignpostRule implements ValidationRule {
  readonly name = 'medical_help_signpost';

  check(candidate: CandidateResponse): ValidationViolation[] {
    const sentences = splitSentences(candidate.text);
    const closing = sentences.slice(-2).join(' ');

    if (REQUIRED_SIGNPOST.test(closing)) {
      return [];
    }

    return [
      {
        code: 'missing_medical_help_signpost',
        rule: this.name,
        detail:
          'Response does not close with the required standing medical-help signpost.',
        evidence: closing || candidate.text,
      },
    ];
  }
}
