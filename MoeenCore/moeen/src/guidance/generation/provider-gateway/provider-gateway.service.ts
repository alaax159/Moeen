import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  RedactablePayload,
  RedactionSubject,
  RedactorPort,
  REDACTOR_PORT,
} from '../../context/redactor/redactor.port';
import { RedactionContext } from '../../context/redactor/redaction-context';
import {
  DispatchOutcome,
  GenerationCallContext,
  ProviderDispatchResult,
  ProviderGatewayPort,
} from './provider-gateway.port';
import { RedactionMetrics } from './redaction-metrics.service';
import { GenerationConfig } from './generation.config';
import { CircuitBreaker } from './circuit-breaker.service';
import { GuidanceRateLimiter } from './guidance-rate-limiter.service';
import { LlmCallExecutor, LlmCallOutcome } from './llm-call-executor.service';
import { isPromptPayload } from './prompt-payload';
import { GenerationFailure, generationFailure } from './generation-failure';
import { TokenUsage } from './llm-provider.port';
import {
  GUIDANCE_CALL_RECORDER,
  GuidanceCallRecorderPort,
  GuidanceCallStatus,
} from './guidance-call-recorder.port';

type FailedCallOutcome = Extract<
  LlmCallOutcome,
  { status: 'timeout' | 'error' }
>;

/**
 * The one class permitted to make an outbound model call.
 *
 * Two responsibilities, in this order and no other:
 *
 * 1. Decide whether this call should happen at all — kill switch, circuit
 *    breaker, rate limits. All three are checked before redaction, because
 *    there is no point redacting a payload nobody will send.
 * 2. Redact, and only then dispatch. Redaction is the last step before the
 *    wire on every request, regardless of what an earlier pipeline stage
 *    already did. This boundary does not trust upstream callers to have
 *    redacted correctly.
 *
 * Everything that can go wrong with a provider comes back as a value. The one
 * thing that still throws is a redaction failure, and that is the point: an
 * outage should degrade, a privacy failure should stop.
 */
@Injectable()
export class ProviderGateway implements ProviderGatewayPort {
  private readonly logger = new Logger(ProviderGateway.name);

  constructor(
    @Inject(REDACTOR_PORT) private readonly redactor: RedactorPort,
    private readonly metrics: RedactionMetrics,
    private readonly config: GenerationConfig,
    private readonly breaker: CircuitBreaker,
    private readonly rateLimiter: GuidanceRateLimiter,
    private readonly executor: LlmCallExecutor,
    @Inject(GUIDANCE_CALL_RECORDER)
    private readonly recorder: GuidanceCallRecorderPort,
  ) {}

  async dispatch<T extends RedactablePayload>(
    payload: T,
    subject: RedactionSubject,
    context?: GenerationCallContext,
  ): Promise<ProviderDispatchResult> {
    const startedAt = Date.now();

    if (!this.config.enabled) {
      // No provider was contacted and no cost was incurred, so there is no
      // model call to record — guidance_call stays a truthful ledger of calls
      // rather than of intentions. Upstream still gets a well-formed result.
      this.logger.log('generation disabled by kill switch; returning fallback');
      return fallback(
        generationFailure('disabled', 'generative output is disabled'),
      );
    }

    if (!this.breaker.tryAcquire()) {
      return this.rejectBeforeDispatch(
        'circuit_open',
        generationFailure(
          'circuit_open',
          'generation circuit is open after repeated provider failures',
        ),
        context,
        startedAt,
      );
    }

    const limit = this.rateLimiter.tryConsume(context?.patientId);
    if (!limit.allowed) {
      // The breaker admitted this call and it is not going to happen, so give
      // the slot back — a rate-limited request says nothing about whether the
      // provider is healthy, and leaving a half-open probe in flight would
      // stall recovery until the next request.
      this.breaker.releaseProbe();
      return this.rejectBeforeDispatch(
        'rate_limited',
        generationFailure('rate_limited', `${limit.scope} rate limit reached`, {
          retryAfterMs: limit.retryAfterMs,
        }),
        context,
        startedAt,
      );
    }

    const redactionContext = new RedactionContext();

    // RedactionFailedError propagates untouched — it must abort the call,
    // never be caught here and fall back to sending `payload` raw.
    let redacted: T;
    try {
      redacted = this.redactor.redact(payload, subject, redactionContext);
    } catch (error) {
      // A privacy failure aborts locally; it is not evidence that the provider
      // recovered or failed. Release a half-open slot for a real probe.
      this.breaker.releaseProbe();
      throw error;
    }
    const redactionCount = redactionContext.totalRedactions();
    this.metrics.recordRedactionCount(redactionCount);

    // Only the redacted payload is ever logged. `payload` itself must never
    // appear in a log call anywhere in this method.
    this.logger.debug({ event: 'provider_gateway.dispatch', redacted });

    if (!isPromptPayload(redacted)) {
      this.breaker.releaseProbe();
      return this.rejectBeforeDispatch(
        'error',
        generationFailure(
          'invalid_prompt_payload',
          'payload carries no systemPrompt and userPrompt after redaction',
        ),
        context,
        startedAt,
        redactionCount,
      );
    }

    const outcome = await this.executor.execute({
      systemPrompt: redacted.systemPrompt,
      userPrompt: redacted.userPrompt,
    });
    const latencyMs = Date.now() - startedAt;

    if (outcome.status === 'success') {
      this.breaker.recordSuccess();
      await this.record(context, {
        status: 'success',
        latencyMs,
        usage: outcome.result.usage,
      });

      return {
        text: outcome.result.text,
        redactionCount,
        outcome: 'generated',
        usage: outcome.result.usage,
      };
    }

    return this.handleFailedCall(outcome, context, latencyMs, redactionCount);
  }

  private async handleFailedCall(
    outcome: FailedCallOutcome,
    context: GenerationCallContext | undefined,
    latencyMs: number,
    redactionCount: number,
  ): Promise<ProviderDispatchResult> {
    const refused = outcome.status === 'error' && outcome.refused;
    const transient = outcome.status === 'error' && outcome.transient;

    // Only timeouts and errors explicitly classified as transient say that
    // the provider is unhealthy. A refusal is a healthy provider answering
    // "no"; permanent 4xx and unclassified errors are local/integration
    // failures and are neutral to breaker health.
    if (outcome.status === 'timeout' || transient) {
      this.breaker.recordFailure();
    } else if (refused) {
      this.breaker.recordSuccess();
    } else {
      this.breaker.releaseProbe();
    }

    const failure: GenerationFailure =
      outcome.status === 'timeout'
        ? generationFailure(
            'timeout',
            `model call timed out after ${this.config.timeoutMs}ms across ${outcome.attempts} attempt(s)`,
          )
        : generationFailure(
            refused ? 'refused' : 'provider_error',
            outcome.error.message,
          );

    this.logger.warn(
      `model call failed (${failure.reason}) after ${outcome.attempts} attempt(s) in ${latencyMs}ms`,
    );

    await this.record(context, {
      status: outcome.status === 'timeout' ? 'timeout' : 'error',
      latencyMs,
    });

    return fallback(failure, redactionCount);
  }

  private async rejectBeforeDispatch(
    status: GuidanceCallStatus,
    failure: GenerationFailure,
    context: GenerationCallContext | undefined,
    startedAt: number,
    redactionCount = 0,
  ): Promise<ProviderDispatchResult> {
    this.logger.warn(`model call not dispatched: ${failure.reason}`);
    await this.record(context, { status, latencyMs: Date.now() - startedAt });
    return fallback(failure, redactionCount);
  }

  private async record(
    context: GenerationCallContext | undefined,
    call: { status: GuidanceCallStatus; latencyMs: number; usage?: TokenUsage },
  ): Promise<void> {
    if (!context) {
      // guidance_call is keyed by patient, so there is no honest row to write.
      // Warned rather than swallowed: a caller that never passes a context
      // would otherwise silently produce a pipeline with no cost visibility,
      // which is exactly what this table exists to prevent.
      this.logger.warn(
        `guidance_call not recorded (status=${call.status}): dispatch() was called without a GenerationCallContext`,
      );
      return;
    }

    await this.recorder.record({
      patientId: context.patientId,
      intent: context.intent,
      tokensIn: call.usage?.promptTokens ?? null,
      tokensOut: call.usage?.completionTokens ?? null,
      latencyMs: call.latencyMs,
      status: call.status,
    });
  }
}

const FALLBACK_OUTCOME: DispatchOutcome = 'fallback_required';

function fallback(
  failure: GenerationFailure,
  redactionCount = 0,
): ProviderDispatchResult {
  return { text: '', redactionCount, outcome: FALLBACK_OUTCOME, failure };
}
