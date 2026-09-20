/**
 * The one error type an LlmProvider is allowed to throw, carrying the single
 * decision the executor needs from it: may this be retried?
 *
 * Classification lives in the adapter, not the executor, because only the
 * adapter knows what its provider's failures mean. The executor never
 * inspects a status code.
 */
export class LlmProviderError extends Error {
  /** True only for failures where the same request could plausibly succeed again: network faults and 5xx. */
  readonly transient: boolean;
  /** The provider declined to answer (content filter, safety refusal). A valid response, not an outage. */
  readonly refused: boolean;
  readonly status?: number;

  constructor(
    message: string,
    options: {
      transient: boolean;
      refused?: boolean;
      status?: number;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'LlmProviderError';
    this.transient = options.transient;
    this.refused = options.refused ?? false;
    this.status = options.status;
  }

  /** Network fault or 5xx — worth one more attempt. */
  static transientFailure(
    message: string,
    status?: number,
    cause?: unknown,
  ): LlmProviderError {
    return new LlmProviderError(message, { transient: true, status, cause });
  }

  /**
   * A 4xx. Never retried: the request is malformed, unauthorised or over
   * quota, and sending the identical bytes again cannot change that. This
   * includes 429 — see the note in transient-classification inside the
   * adapter for why we do not carve out an exception for it.
   */
  static permanentFailure(
    message: string,
    status?: number,
    cause?: unknown,
  ): LlmProviderError {
    return new LlmProviderError(message, { transient: false, status, cause });
  }

  /** The model or its content filter declined. Never retried, never counted against the circuit breaker. */
  static refusal(
    message: string,
    status?: number,
    cause?: unknown,
  ): LlmProviderError {
    return new LlmProviderError(message, {
      transient: false,
      refused: true,
      status,
      cause,
    });
  }
}

/** Raised by the executor, never by an adapter — the adapter is aborted, it does not time itself. */
export class LlmTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`model call exceeded ${timeoutMs}ms`);
    this.name = 'LlmTimeoutError';
  }
}
