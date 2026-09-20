import { CandidateResponse } from '../candidate-response';
import { ValidationContext, ValidationRule } from '../validation-rule.port';
import { ValidationViolation } from '../validation-verdict';

/**
 * Rule 4 — the length bound.
 *
 * Measured on the patient-facing text, not the envelope, since that is what
 * the bound is about. A response far past it has usually stopped answering
 * and started reciting a label, and reciting a label is how dosing tables
 * arrive in an answer.
 */
export class LengthBoundRule implements ValidationRule {
  readonly name = 'length-bound';

  check(
    candidate: CandidateResponse,
    context: ValidationContext,
  ): ValidationViolation[] {
    const length = candidate.text.length;
    if (length <= context.maxResponseChars) return [];

    return [
      {
        code: 'length_exceeded',
        rule: this.name,
        detail: `Response is ${length} characters, past the ${context.maxResponseChars} character bound.`,
        evidence: `${candidate.text.slice(0, 80)}…`,
      },
    ];
  }
}
