import { Logger } from '@nestjs/common';

import { ProviderGateway } from './provider-gateway.service';
import { GenerationConfig } from './generation.config';
import { CircuitBreaker } from './circuit-breaker.service';
import { GuidanceRateLimiter } from './guidance-rate-limiter.service';
import { LlmCallExecutor } from './llm-call-executor.service';
import { StubLlmProvider } from './stub-llm.provider';
import {
  RedactablePayload,
  RedactorPort,
  RedactionSubject,
} from '../../context/redactor/redactor.port';
import { RedactionContext } from '../../context/redactor/redaction-context';
import { RedactionFailedError } from '../../context/redactor/redaction-failed.error';
import {
  promptPayload,
  RecordingGuidanceCallRecorder,
  RecordingRedactionMetrics,
  testGenerationConfig,
} from './provider-gateway.fixtures';

function makeFakeRedactor(
  redact: (
    payload: RedactablePayload,
    subject: RedactionSubject,
    context: RedactionContext,
  ) => RedactablePayload,
): RedactorPort {
  return {
    redact: <T extends RedactablePayload>(
      payload: T,
      subject: RedactionSubject,
      context: RedactionContext,
    ) => redact(payload, subject, context) as T,
  };
}

/**
 * CX-3's guarantees, re-asserted against the GN-2 gateway. Nothing added for
 * resilience, limits or usage recording is allowed to weaken any of them: the
 * redacted payload is what gets dispatched, the raw one is never logged, and a
 * redaction failure still aborts rather than degrading.
 */
describe('ProviderGateway', () => {
  const noOne: RedactionSubject = {};

  let stub: StubLlmProvider;
  let metrics: RecordingRedactionMetrics;
  let recorder: RecordingGuidanceCallRecorder;
  let config: GenerationConfig;

  function buildGateway(redactor: RedactorPort): ProviderGateway {
    return new ProviderGateway(
      redactor,
      metrics,
      config,
      new CircuitBreaker(config),
      new GuidanceRateLimiter(config),
      new LlmCallExecutor(stub, config),
      recorder,
    );
  }

  beforeEach(() => {
    config = testGenerationConfig();
    stub = new StubLlmProvider(config);
    metrics = new RecordingRedactionMetrics();
    recorder = new RecordingGuidanceCallRecorder();
  });

  afterEach(() => jest.restoreAllMocks());

  it('dispatches the redacted payload, never the raw one, to the provider', async () => {
    const redactor = makeFakeRedactor((_payload, _subject, context) => {
      context.placeholderFor('EMAIL', 'jane.doe@example.com');
      return promptPayload({ userPrompt: 'Contact [EMAIL_1]' });
    });
    const gateway = buildGateway(redactor);

    await gateway.dispatch(
      promptPayload({ userPrompt: 'Contact jane.doe@example.com' }),
      noOne,
    );

    expect(stub.received).toHaveLength(1);
    expect(stub.received[0].userPrompt).toBe('Contact [EMAIL_1]');
  });

  it('emits the redaction counter for the request', async () => {
    const redactor = makeFakeRedactor((payload, _subject, context) => {
      context.placeholderFor('EMAIL', 'a@example.com');
      context.placeholderFor('PHONE', '5551234567');
      return payload;
    });
    const gateway = buildGateway(redactor);

    const result = await gateway.dispatch(promptPayload(), noOne);

    expect(metrics.counts).toEqual([2]);
    expect(result.redactionCount).toBe(2);
  });

  it('logs only the redacted payload, never the raw one', async () => {
    const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const redactor = makeFakeRedactor(() =>
      promptPayload({ userPrompt: 'Contact [EMAIL_1]' }),
    );
    const gateway = buildGateway(redactor);

    await gateway.dispatch(
      promptPayload({ userPrompt: 'Contact jane.doe@example.com' }),
      noOne,
    );

    const logged = JSON.stringify(debugSpy.mock.calls);
    expect(logged).toContain('[EMAIL_1]');
    expect(logged).not.toContain('jane.doe@example.com');
  });

  it('aborts and never calls the provider when redaction fails', async () => {
    const redactor = makeFakeRedactor(() => {
      throw new RedactionFailedError('cannot guarantee redaction');
    });
    const gateway = buildGateway(redactor);

    // The one failure that is still allowed to throw. An outage should
    // degrade; a privacy failure must stop.
    await expect(gateway.dispatch(promptPayload(), noOne)).rejects.toThrow(
      RedactionFailedError,
    );
    expect(stub.received).toHaveLength(0);
    expect(metrics.counts).toEqual([]);
  });

  it('gives dispatch() a fresh RedactionContext per call, not one shared across requests', async () => {
    const seenContexts: RedactionContext[] = [];
    const redactor = makeFakeRedactor((payload, _subject, context) => {
      seenContexts.push(context);
      context.placeholderFor('EMAIL', 'a@example.com');
      return payload;
    });
    const gateway = buildGateway(redactor);

    await gateway.dispatch(promptPayload(), noOne);
    await gateway.dispatch(promptPayload(), noOne);

    expect(seenContexts).toHaveLength(2);
    expect(seenContexts[0]).not.toBe(seenContexts[1]);
  });

  it('sends only the two prompt strings, dropping every other redacted field', async () => {
    const gateway = buildGateway({
      redact: <T extends RedactablePayload>(payload: T) => payload,
    });

    await gateway.dispatch(
      {
        systemPrompt: 'S',
        userPrompt: 'U',
        promptVersion: 'gn1.1:missed_dose:with-evidence:d8fb3381',
        suppliedCitationIds: ['chunk-1'],
      },
      noOne,
    );

    // Fields we do not send cannot leak. The adapter reads these two and
    // nothing else, so bookkeeping that rides along on the payload stops here.
    expect(stub.received[0]).toEqual({ systemPrompt: 'S', userPrompt: 'U' });
  });

  it('returns the model text on the happy path', async () => {
    const gateway = buildGateway({
      redact: <T extends RedactablePayload>(payload: T) => payload,
    });

    const result = await gateway.dispatch(promptPayload(), noOne);

    expect(result.outcome).toBe('generated');
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.usage?.promptTokens).toBeGreaterThan(0);
  });
});
