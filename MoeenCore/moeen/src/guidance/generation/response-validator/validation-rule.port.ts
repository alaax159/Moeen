import type {
  SafetyCheckSeverity,
  SafetyFindingType,
  SafetyFindingSeverity,
} from '../../contracts';
import { CandidateResponse } from './candidate-response';
import { ValidationViolation } from './validation-verdict';

/**
 * What the deterministic engine resolved for this run, as the validator needs
 * to see it.
 *
 * Both fields, not just the resolved one: an answer that explains a moderate
 * finding inside a check the engine rated major is faithful, and a rule that
 * only knew the check severity would reject it. See severity-contradiction.rule.ts.
 */
export interface StoredFindingSeverity {
  /** Stable engine category used to tie a severity claim to its finding. */
  type: SafetyFindingType;
  severity: SafetyFindingSeverity;
}

export interface StoredSeverity {
  /** The engine's resolved severity for the whole check. */
  check: SafetyCheckSeverity;
  /** Finding identity and severity, kept together so one cannot validate another. */
  findings: readonly StoredFindingSeverity[];
}

export interface ValidationContext {
  /**
   * The citation ids GN-1 actually put in front of the model this run —
   * AssembledPrompt.suppliedCitationIds, which is derived from the chunks the
   * retriever really returned.
   *
   * Checked against this list, not against a format. An id that looks
   * perfectly well-formed but was never retrieved is a fabricated citation,
   * and a format check would wave it straight through.
   */
  suppliedCitationIds: readonly string[];
  maxResponseChars: number;
  /**
   * The engine's own result for this run, or null when the run had no safety
   * check behind it.
   *
   * Null means the severity rule cannot run, not that it passed — there is no
   * stored value to contradict. Every caller that has a SafetyCheckResult in
   * hand must pass it; ResponseFinalizer does.
   */
  storedSeverity: StoredSeverity | null;
}

/**
 * One rule, one file, one reason to reject. Rules return every violation they
 * find rather than the first, so a review session sees the whole picture of
 * what a candidate did wrong instead of peeling it back one run at a time.
 */
export interface ValidationRule {
  readonly name: string;
  check(
    candidate: CandidateResponse,
    context: ValidationContext,
  ): ValidationViolation[];
}
