import { CandidateResponse } from '../candidate-response';
import { ValidationRule } from '../validation-rule.port';
import { ValidationViolation } from '../validation-verdict';
import { splitSentences } from './text-utils';

/**
 * Generated guidance must close with an affirmative direction to a doctor or
 * pharmacist.
 *
 * A clinician noun by itself is not enough, and an action phrase buried inside
 * a negative sentence is not enough either:
 *
 * - "I am not your doctor."
 * - "Do not contact your pharmacist."
 * - "There is no reason to contact your doctor."
 * - "I cannot recommend that you contact your pharmacist."
 *
 * Rather than trying to enumerate every possible form of negation, this rule
 * accepts only a small set of clearly affirmative referral sentence shapes.
 *
 * Only the final two sentences are inspected because this is a closing
 * invariant, not a requirement that clinician words appear somewhere in the
 * response.
 */

const CLINICIAN = String.raw`(?:your\s+)?(?:doctor|pharmacist)(?:\s+or\s+(?:your\s+)?(?:doctor|pharmacist))?`;

const ACTION_PREFIX = String.raw`(?:(?:for|about|when)\b[^.!?]{0,60},\s*)?(?:please\s+)?`;

const AFFIRMATIVE_REFERRAL_PATTERNS: readonly RegExp[] = [
  // "Please contact your doctor ..."
  new RegExp(
    String.raw`^${ACTION_PREFIX}(?:ask|contact|call|consult)\s+${CLINICIAN}\b`,
    'i',
  ),

  // "Please speak to your pharmacist ..."
  new RegExp(
    String.raw`^${ACTION_PREFIX}(?:speak|talk)\s+to\s+${CLINICIAN}\b`,
    'i',
  ),

  // "Please check with your doctor ..."
  new RegExp(String.raw`^${ACTION_PREFIX}check\s+with\s+${CLINICIAN}\b`, 'i'),

  // "Please reach out to your pharmacist ..."
  new RegExp(
    String.raw`^${ACTION_PREFIX}reach\s+out\s+to\s+${CLINICIAN}\b`,
    'i',
  ),

  // "Please discuss medicine decisions with your doctor."
  new RegExp(
    String.raw`^${ACTION_PREFIX}discuss\b[^.!?]{0,80}\bwith\s+${CLINICIAN}\b`,
    'i',
  ),

  // "Please mention this check to your doctor ..."
  new RegExp(
    String.raw`^${ACTION_PREFIX}mention\b[^.!?]{0,80}\bto\s+${CLINICIAN}\b`,
    'i',
  ),

  // "Your pharmacist can help with decisions about your medicines."
  new RegExp(
    String.raw`^${CLINICIAN}\b[^.!?]{0,80}\b(?:can|could)\s+(?:help|advise|answer|decide|talk)\b`,
    'i',
  ),

  // "Your doctor or pharmacist is the right person to ask ..."
  new RegExp(
    String.raw`^${CLINICIAN}\b[^.!?]{0,80}\b(?:is|are)\s+the\s+right\s+(?:person|people)\s+to\s+ask\b`,
    'i',
  ),

  // "Whether anything about your medicines should change is a decision for
  // your doctor or pharmacist."
  new RegExp(
    String.raw`^whether\b[^.!?]{0,140}\b(?:decision|decisions)\b[^.!?]{0,60}\bfor\s+${CLINICIAN}\b`,
    'i',
  ),

  // Deterministic clear fallback:
  // "If anything about your medicines is worrying you, your doctor or
  // pharmacist can help."
  new RegExp(
    String.raw`^if\b[^.!?]{0,140}\b${CLINICIAN}\b[^.!?]{0,60}\b(?:can|could)\s+help\b`,
    'i',
  ),
];

function isAffirmativeReferralSentence(sentence: string): boolean {
  const normalized = sentence.trim();

  return AFFIRMATIVE_REFERRAL_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

export class ReferralRule implements ValidationRule {
  readonly name = 'referral';

  check(candidate: CandidateResponse): ValidationViolation[] {
    const sentences = splitSentences(candidate.text);
    const closingSentences = sentences.slice(-2);

    if (closingSentences.some(isAffirmativeReferralSentence)) {
      return [];
    }

    return [
      {
        code: 'missing_referral',
        rule: this.name,
        detail:
          'Response does not close with an affirmative direction to a doctor or pharmacist.',
        evidence: closingSentences.join(' ') || candidate.text,
      },
    ];
  }
}
