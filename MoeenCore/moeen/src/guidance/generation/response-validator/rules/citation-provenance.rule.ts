import { CandidateResponse } from '../candidate-response';
import { ValidationContext, ValidationRule } from '../validation-rule.port';
import { ValidationViolation } from '../validation-verdict';

/**
 * Rule 2 — every cited id was really retrieved.
 *
 * Checked against the ids the assembler actually put in this request's
 * prompt, never against a format. That distinction is the whole rule: a
 * fabricated id will look exactly like a real one, because the model has just
 * been shown several real ones to copy the shape of. Only membership of the
 * true retrieved set can tell them apart.
 *
 * Comparison is exact and case-sensitive. Citation ids are opaque identifiers
 * we generate, not text the model is meant to interpret, so a near-miss is a
 * near-miss.
 */
export class CitationProvenanceRule implements ValidationRule {
  readonly name = 'citation-provenance';

  check(
    candidate: CandidateResponse,
    context: ValidationContext,
  ): ValidationViolation[] {
    const supplied = new Set(context.suppliedCitationIds);
    const cited = [
      ...new Set([
        ...candidate.citationIds,
        ...candidate.grounding.flatMap((entry) => entry.citationIds),
      ]),
    ];

    return cited
      .filter((id) => !supplied.has(id))
      .map((id) => ({
        code: 'unknown_citation_id' as const,
        rule: this.name,
        detail:
          supplied.size === 0
            ? `Cited "${id}" when no evidence was retrieved for this request at all.`
            : `Cited "${id}", which was not among the ${supplied.size} excerpt id(s) supplied to the model.`,
        evidence: id,
      }));
  }
}
