import { Inject, Injectable, Logger } from '@nestjs/common';

import { GenerationConfig } from './generation.config';
import { LlmProviderError, LlmTimeoutError } from './llm-provider.error';
import {
  LLM_PROVIDER,
  LlmGenerationResult,
  LlmProviderPort,
} from './llm-provider.port';
import { PromptPayload } from './prompt-payload';

export type LlmCallOutcome =
  | { status: 'success'; result: LlmGenerationResult; attempts: number }
  | { status: 'timeout'; attempts: number; error: Error }
  | {
      status: 'error';
      attempts: number;
      error: Error;
      refused: boolean;
      /** Only provider/network failures that should count against the circuit breaker. */
      transient: boolean;
    };

/**
 * Wraps one provider call in a timeout and at most one retry, and returns the
 * result as data. Nothing here throws for a provider problem — the gateway
 * needs to record a guidance_call row and hand the pipeline a typed failure,
 * and it can only do that if the failure arrives as a value.
 *
 * What gets retried is decided by the adapter, not here: a timeout, and an
 * LlmProviderError the adapter marked transient. A refusal and every 4xx are
 * returned on the first attempt, because resending identical bytes to a
 * provider that already refused them wastes the patient's time to reach the
 * same answer.
 */
@Injectable()
export class LlmCallExecutor {
  private readonly logger = new Logger(LlmCallExecutor.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProviderPort,
    private readonly config: GenerationConfig,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  async execute(prompt: PromptPayload): Promise<LlmCallOutcome> {
    const maxAttempts = this.config.maxAttempts;
    let attempts = 0;
    let lastError: Error = new Error('model call never attempted');

    while (attempts < maxAttempts) {
      attempts += 1;

      try {
        const result = await callWithTimeout(
          (signal) =>
            this.provider.generate(prompt, {
              signal,
              maxOutputTokens: this.config.maxOutputTokens,
            }),
          this.config.timeoutMs,
        );

        return { status: 'success', result, attempts };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (!this.mayRetry(lastError) || attempts >= maxAttempts) {
          return this.toFailure(lastError, attempts);
        }

        this.logger.warn(
          `model call attempt ${attempts}/${maxAttempts} failed (${lastError.name}); retrying`,
        );
        await sleep(this.config.retryDelayMs);
      }
    }

    return this.toFailure(lastError, attempts);
  }

  private mayRetry(error: Error): boolean {
    if (error instanceof LlmTimeoutError) return true;
    if (error instanceof LlmProviderError) return error.transient;

    // An error the adapter did not classify is most likely a bug in our own
    // code, not a flaky provider. Retrying a bug just runs it twice.
    return false;
  }

  private toFailure(error: Error, attempts: number): LlmCallOutcome {
    if (error instanceof LlmTimeoutError) {
      return { status: 'timeout', attempts, error };
    }

    const providerError = error instanceof LlmProviderError ? error : undefined;

    return {
      status: 'error',
      attempts,
      error,
      refused: providerError?.refused ?? false,
      transient: providerError?.transient ?? false,
    };
  }
}

/**
 * Races the call against the clock and aborts the loser. The signal is what
 * makes this a real timeout rather than a cosmetic one: without it the
 * abandoned request would keep its socket and keep costing us tokens while
 * nobody is waiting for the answer.
 */
async function callWithTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const work = (async () => run(controller.signal))();

  // The losing side of the race still settles. Without this, its rejection is
  // unhandled and Node warns (or, under some flags, exits).
  work.catch(() => undefined);

  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new LlmTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([work, expiry]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
