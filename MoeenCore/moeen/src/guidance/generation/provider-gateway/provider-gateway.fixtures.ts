import {
  RedactablePayload,
  RedactorPort,
} from '../../context/redactor/redactor.port';
import { ConfigService } from '@nestjs/config';

import {
  GENERATION_CONFIG_DEFAULTS,
  GenerationConfig,
} from './generation.config';
import { CircuitBreaker } from './circuit-breaker.service';
import { GuidanceRateLimiter } from './guidance-rate-limiter.service';
import { LlmCallExecutor } from './llm-call-executor.service';
import { StubLlmProvider } from './stub-llm.provider';
import { ProviderGateway } from './provider-gateway.service';
import { RedactionMetrics } from './redaction-metrics.service';
import { PromptPayload } from './prompt-payload';
import {
  GuidanceCallRecord,
  GuidanceCallRecorderPort,
} from './guidance-call-recorder.port';

export type GenerationConfigOverrides = Partial<
  Record<keyof typeof GENERATION_CONFIG_DEFAULTS, string | number | boolean>
>;

/** A GenerationConfig over a plain object, so a spec states only the keys it cares about. */
export function testGenerationConfig(
  overrides: GenerationConfigOverrides = {},
): GenerationConfig {
  const values = overrides as Record<string, string | number | boolean>;
  const configService = {
    get: (key: string) => values[key],
  } as unknown as ConfigService;

  return new GenerationConfig(configService);
}

/** Keeps written rows in memory so a spec can assert on cost bookkeeping without a database. */
export class RecordingGuidanceCallRecorder implements GuidanceCallRecorderPort {
  readonly rows: GuidanceCallRecord[] = [];

  record(call: GuidanceCallRecord): Promise<void> {
    this.rows.push(call);
    return Promise.resolve();
  }
}

export class RecordingRedactionMetrics extends RedactionMetrics {
  readonly counts: number[] = [];

  override recordRedactionCount(count: number): void {
    this.counts.push(count);
  }
}

/**
 * Identity redactor. Used where a spec is about resilience rather than
 * privacy, so assertions read against the prompt that went in. The PII suite
 * deliberately uses the real Redactor instead.
 */
export const passthroughRedactor: RedactorPort = {
  redact: <T extends RedactablePayload>(payload: T): T => payload,
};

export function promptPayload(
  overrides: Partial<PromptPayload> = {},
): PromptPayload {
  return {
    systemPrompt: 'You explain. You never prescribe.',
    userPrompt: 'Reference excerpts:\n[citation id: chunk-warfarin-01]\nText.',
    ...overrides,
  };
}

export interface GatewayHarness {
  gateway: ProviderGateway;
  stub: StubLlmProvider;
  recorder: RecordingGuidanceCallRecorder;
  breaker: CircuitBreaker;
  rateLimiter: GuidanceRateLimiter;
  config: GenerationConfig;
  metrics: RecordingRedactionMetrics;
}

/** Wires a real gateway over the stub provider — the only provider any test is allowed to reach. */
export function buildGatewayHarness(
  overrides: GenerationConfigOverrides = {},
  redactor: RedactorPort = passthroughRedactor,
): GatewayHarness {
  const config = testGenerationConfig({
    // Zero by default so retries and stub latency never make a spec wait on a
    // real timer; a spec that is about the delay sets it explicitly.
    GENERATION_RETRY_DELAY_MS: 0,
    ...overrides,
  });

  const stub = new StubLlmProvider(config);
  const breaker = new CircuitBreaker(config);
  const rateLimiter = new GuidanceRateLimiter(config);
  const executor = new LlmCallExecutor(stub, config);
  const recorder = new RecordingGuidanceCallRecorder();
  const metrics = new RecordingRedactionMetrics();

  const gateway = new ProviderGateway(
    redactor,
    metrics,
    config,
    breaker,
    rateLimiter,
    executor,
    recorder,
  );

  return { gateway, stub, recorder, breaker, rateLimiter, config, metrics };
}
