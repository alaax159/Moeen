/**
 * Why a candidate response was refused. One code per reason so the rejection
 * log, and later the review queue, can be grouped by cause rather than by
 * free text.
 */
export type ValidationRejectionCode =
  /** Not the JSON envelope every template demands, or the wrong field types. */
  | 'malformed_envelope'
  /** Parsed cleanly but said nothing. */
  | 'empty_response'
  /** A factual claim about a medicine with no citation behind it. */
  | 'uncited_medication_claim'
  /** Claim-to-citation map is incomplete, ambiguous, or disagrees with the summary list. */
  | 'invalid_claim_grounding'
  /** Cited an id that was not in this request's retrieved set. */
  | 'unknown_citation_id'
  /** A dose amount or strength — "10 mg", "two tablets", "half a tablet". */
  | 'dose_amount'
  /** A dosing frequency or a time to take something — "twice a day", "at bedtime", "8pm". */
  | 'dosing_frequency'
  /** An instruction to change what the patient takes or when they take it. */
  | 'schedule_change'
  /** Naming a condition, saying what a symptom means, or judging how serious it is. */
  | 'diagnosis'
  /** Softened, escalated, re-ranked or denied a severity the engine already resolved. */
  | 'severity_contradiction'
  /** Did not close with an affirmative doctor or pharmacist referral. */
  | 'missing_referral'
  /** Omitted the standing medical-help signpost required in every answer. */
  | 'missing_medical_help_signpost'
  /** Longer than the configured bound. */
  | 'length_exceeded';

export interface ValidationViolation {
  code: ValidationRejectionCode;
  /** Which rule fired, for the rejection log. */
  rule: string;
  /** Why, in a sentence a human reviewing the log can act on. */
  detail: string;
  /**
   * The fragment that fired, with a little surrounding text.
   *
   * Safe to log: this is model output, which the templates forbid from
   * carrying identifiers, and the payload it was generated from went through
   * the redactor before it ever left our boundary.
   */
  evidence?: string;
}

/**
 * The whole point of the story, as a type: either we have text a patient may
 * see, or we have reasons we are not showing it. There is no third state and
 * no partially-approved response.
 *
 * GN-3 T2 turns the rejected arm into the deterministic fallback and persists
 * `validationStatus`. T1 stops here, at the verdict.
 */
export type ValidationVerdict =
  | { accepted: true; text: string; citationIds: string[] }
  | { accepted: false; violations: ValidationViolation[] };

export function isRejected(
  verdict: ValidationVerdict,
): verdict is { accepted: false; violations: ValidationViolation[] } {
  return !verdict.accepted;
}

/** One-line summary of a rejection, for the log line T2 writes. */
export function summarizeViolations(
  violations: readonly ValidationViolation[],
): string {
  return violations.map((violation) => violation.code).join(', ');
}
