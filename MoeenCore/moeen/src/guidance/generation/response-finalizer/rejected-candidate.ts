import type { GuidanceIntent } from '../../contracts';
import type { ValidationViolation } from '../response-validator/validation-verdict';

/**
 * Why a patient is seeing deterministic text instead of a generated answer.
 *
 * Not the same thing as GuidanceResponse.validationStatus, and deliberately
 * kept off it: the contract has two statuses because the client only needs to
 * know whether what it received was generated or fallback. A reviewer needs
 * more than that — an answer nobody ever saw because the provider was down is
 * a different problem from an answer the rules refused, and grouping them
 * under one status would hide an outage inside a rejection rate.
 */
export type FallbackReason =
  /** The validator ran and refused the candidate. */
  | 'validation_rejected'
  /** No candidate existed: timeout, outage, open circuit, rate limit, kill switch. */
  | 'provider_unavailable';

/**
 * One refused generation, kept for review.
 *
 * Retained rather than discarded because a rejection rate with no examples
 * behind it cannot be acted on: it is impossible to tell a validator that is
 * too strict from a model that is misbehaving without reading what was
 * actually refused. This record is the input to the false-positive review the
 * story asks for.
 *
 * Nothing here reaches the client. The finalizer builds the patient's answer
 * from the finding set and hands this to the store on a separate path.
 */
export interface RejectedCandidate {
  /** Null when the run had no patient context attached (a wiring gap, not a normal case). */
  patientId: number | null;
  intent: GuidanceIntent;
  promptVersion: string;
  reason: FallbackReason;
  /**
   * The refused text, verbatim.
   *
   * Safe to store: it is model output, produced from a payload the redactor
   * scrubbed before it left our boundary, and the templates forbid it from
   * carrying identifiers. Empty when the provider never produced one.
   */
  candidateText: string;
  /** What the candidate claimed to cite. */
  citedIds: string[];
  /** What was really retrieved for this run — the two together are what make a fabricated citation visible. */
  suppliedCitationIds: string[];
  violations: ValidationViolation[];
  rejectedAt: string;
}
