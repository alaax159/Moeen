import type { GuidanceIntent } from '../../contracts';
import {
  RedactablePayload,
  RedactionSubject,
} from '../../context/redactor/redactor.port';
import { GenerationFailure } from './generation-failure';
import { TokenUsage } from './llm-provider.port';

/**
 * 'generated' — `text` is raw model output for GN-3 to validate.
 * 'fallback_required' — `text` is empty and `failure` says why. The caller must
 * answer the patient from the deterministic findings instead.
 */
export type DispatchOutcome = 'generated' | 'fallback_required';

export interface ProviderDispatchResult {
  /** Empty string whenever outcome is 'fallback_required'. Never null, so no caller has to null-check before validating. */
  text: string;
  /** Distinct values substituted out of this request's payload — the redaction counter. */
  redactionCount: number;
  outcome: DispatchOutcome;
  /** Present on success. Absent when no provider call was made. */
  usage?: TokenUsage;
  /** Present iff outcome is 'fallback_required'. */
  failure?: GenerationFailure;
}

/**
 * Identifies the call for rate limiting and for its guidance_call row.
 *
 * Kept out of the payload on purpose: patientId must never reach a model, and
 * the redactor would strip it anyway. It travels beside the payload, not
 * inside it.
 */
export interface GenerationCallContext {
  patientId: number;
  intent: GuidanceIntent;
}

/**
 * The only sanctioned way to reach a model provider. Everything upstream
 * depends on this port, never on LlmProviderPort directly.
 */
export interface ProviderGatewayPort {
  /**
   * Never rejects because of a provider problem — a timeout, an outage, an
   * open circuit, a rate limit or the kill switch all come back as
   * `outcome: 'fallback_required'` with a typed failure. The single exception
   * is RedactionFailedError, which still propagates: a call we cannot
   * guarantee is redacted must abort rather than degrade.
   *
   * `context` is optional only so that this stays source-compatible with
   * callers written against the CX-3 signature. Pass it: without it the
   * per-patient rate limit cannot apply (only the global one does) and no
   * guidance_call row can be written, since that row is keyed by patient.
   */
  dispatch<T extends RedactablePayload>(
    payload: T,
    subject: RedactionSubject,
    context?: GenerationCallContext,
  ): Promise<ProviderDispatchResult>;
}

export const PROVIDER_GATEWAY_PORT = Symbol('PROVIDER_GATEWAY_PORT');
