import { Injectable } from '@nestjs/common';
import { parseCandidateResponse } from './candidate-response';
import { ValidationConfig } from './validation.config';
import { ValidationContext, ValidationRule } from './validation-rule.port';
import { ValidationVerdict, ValidationViolation } from './validation-verdict';
import { CitationProvenanceRule } from './rules/citation-provenance.rule';
import { ClaimGroundingIntegrityRule } from './rules/claim-grounding-integrity.rule';
import { DiagnosisRule } from './rules/diagnosis.rule';
import { DoseAmountRule } from './rules/dose-amount.rule';
import { DosingFrequencyRule } from './rules/dosing-frequency.rule';
import { LengthBoundRule } from './rules/length-bound.rule';
import { MedicalHelpSignpostRule } from './rules/medical-help-signpost.rule';
import { ReferralRule } from './rules/referral.rule';
import { ScheduleChangeRule } from './rules/schedule-change.rule';
import { SeverityContradictionRule } from './rules/severity-contradiction.rule';
import { UncitedClaimRule } from './rules/uncited-claim.rule';
import type { StoredSeverity } from './validation-rule.port';

export interface ValidationInput {
  /** Raw provider output, exactly as it came back. */
  rawText: string;
  /**
   * AssembledPrompt.suppliedCitationIds for this run — the ids that were
   * really placed in front of the model. Pass an empty array for a
   * no-evidence run; that is what makes any citation at all a fabrication.
   */
  suppliedCitationIds: readonly string[];
  /**
   * What the deterministic engine resolved for this run.
   *
   * Optional in the signature and never optional in practice: omit it and the
   * severity rule has nothing to compare against, so a response that
   * contradicts the engine is accepted. Any caller holding a SafetyCheckResult
   * has to pass it. Omitted only where there genuinely was no check.
   */
  storedSeverity?: StoredSeverity | null;
}

/** Order is presentation only. Every rule runs on every candidate. */
export const DEFAULT_VALIDATION_RULES: readonly ValidationRule[] =
  Object.freeze([
    new ClaimGroundingIntegrityRule(),
    new UncitedClaimRule(),
    new CitationProvenanceRule(),
    new DoseAmountRule(),
    new DosingFrequencyRule(),
    new ScheduleChangeRule(),
    new DiagnosisRule(),
    new SeverityContradictionRule(),
    new ReferralRule(),
    new MedicalHelpSignpostRule(),
    new LengthBoundRule(),
  ]);

/**
 * The last thing between a model and a patient.
 *
 * Two properties are deliberate and worth not undoing later:
 *
 * 1. It never edits. There is no sanitising pass that strips a dose number
 *    and lets the rest through, because a response that contained a dose is a
 *    response whose reasoning we do not trust, and the sentences around the
 *    number came from the same place.
 *
 * 2. It runs every rule rather than stopping at the first violation. The cost
 *    of a full pass is a few regexes; the benefit is that a rejection log
 *    entry shows everything a candidate did wrong, which is what makes the
 *    false-positive review in this story tractable.
 *
 * T1 ends at the verdict. Turning a rejection into deterministic text,
 * persisting validation_status and retaining the rejected candidate are T2.
 */
@Injectable()
export class ResponseValidator {
  private readonly rules: readonly ValidationRule[] = DEFAULT_VALIDATION_RULES;

  constructor(private readonly config: ValidationConfig) {}

  validate(input: ValidationInput): ValidationVerdict {
    const parsed = parseCandidateResponse(input.rawText);
    if (!parsed.ok) {
      return { accepted: false, violations: [parsed.violation] };
    }

    const context: ValidationContext = {
      suppliedCitationIds: input.suppliedCitationIds,
      maxResponseChars: this.config.maxResponseChars,
      storedSeverity: input.storedSeverity ?? null,
    };

    const violations: ValidationViolation[] = this.rules.flatMap((rule) =>
      rule.check(parsed.candidate, context),
    );

    if (violations.length > 0) {
      return { accepted: false, violations };
    }

    return {
      accepted: true,
      text: parsed.candidate.text,
      citationIds: parsed.candidate.citationIds,
    };
  }
}
