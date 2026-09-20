import { CandidateResponse } from '../candidate-response';
import { ValidationContext, ValidationRule } from '../validation-rule.port';
import { ValidationViolation } from '../validation-verdict';
import { splitSentencesPreservingText } from './text-utils';

/**
 * Makes the model's claim-to-source association complete and auditable.
 * Every patient-facing sentence must occur exactly once in `grounding`, and
 * the legacy top-level citation list must be exactly the union of the
 * per-claim lists. No citation can therefore float beside unrelated prose.
 */
export class ClaimGroundingIntegrityRule implements ValidationRule {
  readonly name = 'claim-grounding-integrity';

  check(
    candidate: CandidateResponse,
    context: ValidationContext,
  ): ValidationViolation[] {
    void context;
    const violations: ValidationViolation[] = [];
    const responseClaims = splitSentencesPreservingText(candidate.text);
    const mappedClaims: string[] = [];

    for (const entry of candidate.grounding) {
      const parts = splitSentencesPreservingText(entry.claim);
      if (parts.length !== 1) {
        violations.push(
          this.violation(
            'Each grounding claim must map one response sentence, not zero or several.',
            entry.claim,
          ),
        );
        continue;
      }
      mappedClaims.push(parts[0]);

      if (new Set(entry.citationIds).size !== entry.citationIds.length) {
        violations.push(
          this.violation(
            'A grounding entry repeated the same citation id.',
            entry.claim,
          ),
        );
      }
    }

    const expectedClaims = responseClaims;
    const actualClaims = mappedClaims;
    if (
      expectedClaims.length !== actualClaims.length ||
      expectedClaims.some((claim, index) => claim !== actualClaims[index])
    ) {
      violations.push(
        this.violation(
          'Grounding must contain every response sentence exactly once, in order, and no text that is absent from the response.',
        ),
      );
    }

    const summary = new Set(candidate.citationIds);
    const grounded = new Set(
      candidate.grounding.flatMap((entry) => entry.citationIds),
    );
    if (
      summary.size !== candidate.citationIds.length ||
      !sameSet(summary, grounded)
    ) {
      violations.push(
        this.violation(
          'The top-level citationIds must contain exactly the unique citations used by grounded claims.',
          candidate.citationIds.join(', '),
        ),
      );
    }

    return violations;
  }

  private violation(detail: string, evidence?: string): ValidationViolation {
    return {
      code: 'invalid_claim_grounding',
      rule: this.name,
      detail,
      ...(evidence ? { evidence } : {}),
    };
  }
}

function sameSet(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}
