import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RedactorModule } from '../../context/redactor/redactor.module';
import { ProviderGateway } from './provider-gateway.service';
import { RedactionMetrics } from './redaction-metrics.service';
import { PROVIDER_GATEWAY_PORT } from './provider-gateway.port';
import { GenerationConfig } from './generation.config';
import { CircuitBreaker } from './circuit-breaker.service';
import { GuidanceRateLimiter } from './guidance-rate-limiter.service';
import { LlmCallExecutor } from './llm-call-executor.service';
import { LLM_PROVIDER, LlmProviderPort } from './llm-provider.port';
import { StubLlmProvider } from './stub-llm.provider';
import { FoundryLlmProvider } from './foundry-llm.provider';
import { GUIDANCE_CALL_RECORDER } from './guidance-call-recorder.port';
import { DrizzleGuidanceCallRecorder } from './drizzle-guidance-call-recorder.service';

/**
 * Deliberately exports only PROVIDER_GATEWAY_PORT. LLM_PROVIDER, the concrete
 * adapters, the executor, the breaker and the rate limiter all stay inside —
 * Nest will not resolve a provider that is not in `exports`, so nothing
 * outside this folder can inject the raw client, and nothing can reach a model
 * except through ProviderGateway.dispatch(). Widening this array to leak the
 * client is a one-line diff any reviewer would immediately flag, and
 * provider-gateway.architecture.spec.ts fails the build if the token is even
 * mentioned elsewhere.
 */
@Module({
  imports: [RedactorModule, HttpModule],
  providers: [
    RedactionMetrics,
    GenerationConfig,
    CircuitBreaker,
    GuidanceRateLimiter,
    StubLlmProvider,
    FoundryLlmProvider,
    {
      // The one switch. GENERATION_PROVIDER=stub (the default) runs the whole
      // pipeline with no Foundry account, no key, no network and no cost;
      // GENERATION_PROVIDER=foundry runs it for real. Both adapters are
      // constructed either way — they are cheap, hold no connection, and
      // resolving both here keeps the choice a value rather than a wiring
      // difference that only shows up at boot.
      provide: LLM_PROVIDER,
      inject: [GenerationConfig, StubLlmProvider, FoundryLlmProvider],
      useFactory: (
        config: GenerationConfig,
        stub: StubLlmProvider,
        foundry: FoundryLlmProvider,
      ): LlmProviderPort =>
        config.providerName === 'foundry' ? foundry : stub,
    },
    LlmCallExecutor,
    { provide: GUIDANCE_CALL_RECORDER, useClass: DrizzleGuidanceCallRecorder },
    { provide: PROVIDER_GATEWAY_PORT, useClass: ProviderGateway },
  ],
  exports: [PROVIDER_GATEWAY_PORT],
})
export class ProviderGatewayModule {}
