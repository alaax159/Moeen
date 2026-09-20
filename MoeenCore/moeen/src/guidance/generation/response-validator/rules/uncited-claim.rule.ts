import { CandidateResponse } from '../candidate-response';
import { ValidationContext, ValidationRule } from '../validation-rule.port';
import { ValidationViolation } from '../validation-verdict';
import { normalizeForMatching, splitSentences } from './text-utils';

const MEDICINE_SUBJECTS = [
  'medicines?',
  'medications?',
  'drugs?',
  'tablets?',
  'capsules?',
  'pills?',
  'treatments?',
  'ingredients?',
  String.raw`active\s+ingredients?`,
].join('|');

/**
 * Verbs that turn a mention of a medicine into a factual assertion about it.
 *
 * Kept to assertive constructions on purpose. "Your pharmacist can answer
 * questions about your medicine" mentions a medicine and asserts nothing about
 * it, and must survive — it is the referral line every template requires.
 */
const CLAIM_VERBS = [
  String.raw`is\s+used`,
  String.raw`are\s+used`,
  String.raw`is\s+prescribed`,
  String.raw`are\s+prescribed`,
  String.raw`is\s+taken\s+for`,
  String.raw`is\s+for`,
  String.raw`is\s+known\s+to`,
  String.raw`is\s+intended`,
  'treats?',
  String.raw`helps?\s+(?:with|to)`,
  String.raw`works?\s+by`,
  String.raw`acts?\s+by`,
  'contains?',
  String.raw`belongs?\s+to`,
  String.raw`(?:can|may|might|could)\s+cause`,
  'causes?',
  String.raw`(?:can|may|might|could)\s+lead\s+to`,
  'lowers?',
  'raises?',
  'reduces?',
  'increases?',
  'blocks?',
  'affects?',
  'interacts?',
  'relieves?',
  'prevents?',
  'controls?',
  'manages?',
].join('|');

const MEDICINE_CLAIM = new RegExp(
  String.raw`\b(?:${MEDICINE_SUBJECTS})\b[\s\S]{0,80}?\b(?:${CLAIM_VERBS})\b`,
  'i',
);

/**
 * A claim verb anywhere, with no medicine noun required.
 *
 * Used only on a run where retrieval returned nothing at all — see the
 * zero-evidence arm below for why the subject can be dropped there and
 * nowhere else.
 */
const ANY_CLAIM = new RegExp(String.raw`\b(?:${CLAIM_VERBS})\b`, 'i');

/**
 * Assertions of safety or reassurance that carry no claim verb at all.
 *
 * "That combination is well tolerated by most people" asserts a clinical fact
 * about two medicines using none of the vocabulary above, and on a run with no
 * evidence behind it there is nothing supporting it except the model.
 */
const BARE_ASSERTION =
  /\b(?:is|are|was|were)\s+(?:completely\s+|perfectly\s+|entirely\s+|generally\s+|usually\s+|quite\s+|very\s+)?(?:safe|fine|ok|okay|harmless|compatible|well\s+tolerated|unsafe|dangerous|risky)\b|\bno\s+(?:known\s+)?(?:problem|issue|risk|concern|interaction|conflict|clash)s?\b|^(?:yes|no)\b\s*[,:—-]/i;

/**
 * What a sentence is allowed to be doing on a request that retrieved nothing.
 *
 * An allow-list, and the only one in the validator. Everywhere else the rules
 * name what is forbidden, because the space of acceptable patient guidance is
 * far too large to enumerate — but on a no-evidence run it is not large at
 * all. The template tells the model to say it has nothing to answer from, to
 * refer, and to stop, so the acceptable answer is close to fixed text and an
 * allow-list can be written honestly.
 *
 * Inverting the test here is what closed the last two red-team bypasses.
 * "Amoxicillin fights bacterial infections" and "There is nothing about this
 * combination that should concern you" are both fabrications, and neither
 * contains a single word a forbidden-list had heard of — the second contains
 * no clinical vocabulary whatsoever. No list of banned verbs would have caught
 * them, because the thing that makes them wrong is that nothing supports them,
 * which is a property of the request rather than of the words.
 */
const PERMITTED_WITHOUT_EVIDENCE: readonly RegExp[] = [
  // Saying we have nothing to answer from.
  /\b(?:do\s+not|does\s+not|cannot|not)\s+(?:have|hold|carry)\b/i,
  /\b(?:no|without)\s+reference\s+(?:information|material|excerpts?)\b/i,
  /\bnot\s+(?:able|going)\s+to\b/i,
  /\b(?:cannot|will\s+not|do\s+not)\s+(?:answer|guess|say)\b/i,
  /\bnot\s+available\b/i,
  // Referring, which every template requires.
  /\b(?:doctors?|pharmacists?|nurses?|prescribers?|clinics?|appointments?)\b/i,
  /\bmedical\s+help\b/i,
  // Explaining the deterministic check, which needs no citation.
  /\b(?:checks?|findings?|flagged|safety|recorded|profile)\b/i,
  // General comfort, explicitly permitted by limit 4.
  /\b(?:thanks?\s+for|good\s+question|common\s+(?:worry|question)|understand\s+why|happy\s+to)\b/i,
];

function isPermittedWithoutEvidence(sentence: string): boolean {
  return PERMITTED_WITHOUT_EVIDENCE.some((pattern) => pattern.test(sentence));
}

/**
 * Rule 1 — no medicine claim without a citation.
 *
 * The shared constraint block tells the model that every factual claim about
 * a medicine must come from a supplied excerpt. This is the enforcement: if
 * the response asserts something about a medicine and cited nothing, the
 * assertion came from the model's own memory, and model memory is exactly
 * what this pipeline exists to keep out of a patient's hands.
 *
 * Scoped per sentence so a medicine noun in one sentence cannot be paired
 * with a claim verb three sentences later.
 *
 * The rule has two arms, and the difference between them is what the run had
 * available rather than what the response claimed:
 *
 * - **Cited nothing.** A medicine noun plus a claim verb is a violation. The
 *   noun is required because evidence existed and the model may legitimately
 *   have written general comfort that needs no citation.
 *
 * - **Nothing was retrieved.** The test inverts: a sentence has to be doing
 *   one of the jobs in PERMITTED_WITHOUT_EVIDENCE, and carry no claim verb or
 *   bare assertion. On a no-evidence run the template tells the model to say
 *   it cannot answer and refer, so the acceptable answer is close to fixed
 *   text and an allow-list can be written honestly.
 *
 *   This arm exists because the red-team pass found the forbidden-list
 *   approach could not be finished. "Warfarin thins your blood" names a drug
 *   rather than "the medicine" and carries a verb nobody thought to list;
 *   "there is nothing about this combination that should concern you" contains
 *   no clinical vocabulary at all. Drug names are unbounded and reassurance is
 *   unbounded, so no list of banned words would ever have caught either —
 *   what makes them wrong is that nothing supports them, which is a property
 *   of the request rather than of the words.
 */
export class UncitedClaimRule implements ValidationRule {
  readonly name = 'uncited-claim';

  check(
    candidate: CandidateResponse,
    context: ValidationContext,
  ): ValidationViolation[] {
    const noEvidenceRetrieved = context.suppliedCitationIds.length === 0;
    const sentences = splitSentences(candidate.text);

    if (noEvidenceRetrieved) {
      // Both halves are required. A sentence that refers the patient onwards
      // is allowed; a sentence that smuggles a claim in beside the referral —
      // "warfarin thins your blood, so do ask your pharmacist" — is not.
      return sentences
        .filter(
          (sentence) =>
            !isPermittedWithoutEvidence(sentence) ||
            ANY_CLAIM.test(sentence) ||
            BARE_ASSERTION.test(sentence),
        )
        .map((sentence) => ({
          code: 'uncited_medication_claim' as const,
          rule: this.name,
          detail:
            'Asserts something on a request where retrieval returned no evidence at all. With nothing supplied, everything in the answer came from the model.',
          evidence: sentence,
        }));
    }

    // A repeated sentence produces one grounding entry per occurrence, so a
    // claim can appear more than once with different citations. Keep the
    // weakest entry: if any occurrence was left uncited, the claim is uncited.
    // Letting a cited duplicate vouch for an uncited one would put an
    // ungrounded medicine claim in front of the patient.
    const citationsByClaim = new Map<string, string[]>();

    for (const entry of candidate.grounding) {
      const claim = normalizeForMatching(entry.claim);
      const weakest = citationsByClaim.get(claim);

      if (weakest === undefined || entry.citationIds.length < weakest.length) {
        citationsByClaim.set(claim, entry.citationIds);
      }
    }

    return sentences
      .filter(
        (sentence) =>
          MEDICINE_CLAIM.test(sentence) &&
          (citationsByClaim.get(normalizeForMatching(sentence))?.length ??
            0) === 0,
      )
      .map((sentence) => ({
        code: 'uncited_medication_claim' as const,
        rule: this.name,
        detail:
          'Makes a factual claim about a medicine without a citation on that claim. Citations attached to other sentences cannot support it.',
        evidence: sentence,
      }));
  }
}
