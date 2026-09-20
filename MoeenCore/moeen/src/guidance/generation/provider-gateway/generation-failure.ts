/**
 * Why a dispatch produced no model text. Every one of these is *returned*,
 * never thrown: the pipeline above us must still answer the patient, so a bad
 * provider day has to arrive as data it can branch on, not as an exception
 * that unwinds the request.
 *
 * The one deliberate exception is RedactionFailedError, which still throws out
 * of dispatch(). That is CX-3's invariant and it is not softened here — a call
 * we cannot guarantee is redacted must abort, not degrade.
 */
export type GenerationFailureReason =
  /** Kill switch is off. No provider was contacted and no cost was incurred. */
  | 'disabled'
  | 'rate_limited'
  | 'circuit_open'
  | 'timeout'
  /** Network fault, 5xx, 4xx or a malformed response — anything the provider did wrong. */
  | 'provider_error'
  /** The model or its content filter declined to answer. Not an outage. */
  | 'refused'
  /** The payload did not carry a system and user prompt after redaction. Our bug, not the provider's. */
  | 'invalid_prompt_payload';

export interface GenerationFailure {
  reason: GenerationFailureReason;
  message: string;
  /** Whether an identical request later could plausibly succeed. Never used to retry inside one dispatch. */
  retryable: boolean;
  /** Set for rate limits, so a caller that wants to tell the patient "in a moment" can. */
  retryAfterMs?: number;
}

export function generationFailure(
  reason: GenerationFailureReason,
  message: string,
  extra: { retryable?: boolean; retryAfterMs?: number } = {},
): GenerationFailure {
  return {
    reason,
    message,
    retryable: extra.retryable ?? DEFAULT_RETRYABLE[reason],
    ...(extra.retryAfterMs === undefined
      ? {}
      : { retryAfterMs: extra.retryAfterMs }),
  };
}

const DEFAULT_RETRYABLE: Record<GenerationFailureReason, boolean> = {
  disabled: false,
  rate_limited: true,
  circuit_open: true,
  timeout: true,
  provider_error: true,
  refused: false,
  invalid_prompt_payload: false,
};
