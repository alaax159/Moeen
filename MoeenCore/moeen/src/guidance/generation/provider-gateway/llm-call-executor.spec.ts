import { Logger } from '@nestjs/common';

import { LlmCallExecutor } from './llm-call-executor.service';
import { LlmProviderError, LlmTimeoutError } from './llm-provider.error';
import { StubLlmProvider } from './stub-llm.provider';
import {
  GenerationConfigOverrides,
  promptPayload,
  testGenerationConfig,
} from './provider-gateway.fixtures';

function buildExecutor(overrides: GenerationConfigOverrides = {}) {
  const config = testGenerationConfig({
    GENERATION_RETRY_DELAY_MS: 0,
    ...overrides,
  });
  const stub = new StubLlmProvider(config);

  return { executor: new LlmCallExecutor(stub, config), stub };
}

describe('LlmCallExecutor', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns the provider result on the first attempt when nothing goes wrong', async () => {
    const { executor } = buildExecutor();

    const outcome = await executor.execute(promptPayload());

    expect(outcome.status).toBe('success');
    expect(outcome.attempts).toBe(1);
  });

  it('converts a timeout into a typed outcome instead of throwing', async () => {
    const { executor, stub } = buildExecutor({
      GENERATION_TIMEOUT_MS: 20,
      GENERATION_MAX_ATTEMPTS: 1,
    });
    stub.enqueue({ kind: 'hang' });

    const outcome = await executor.execute(promptPayload());

    expect(outcome.status).toBe('timeout');
    if (outcome.status === 'timeout') {
      expect(outcome.error).toBeInstanceOf(LlmTimeoutError);
    }
  });

  it('aborts the abandoned call rather than leaving it running', async () => {
    const { executor, stub } = buildExecutor({
      GENERATION_TIMEOUT_MS: 20,
      GENERATION_MAX_ATTEMPTS: 1,
    });
    let seenSignal: AbortSignal | undefined;
    jest.spyOn(stub, 'generate').mockImplementation((_prompt, options) => {
      seenSignal = options.signal;
      return new Promise(() => undefined);
    });

    await executor.execute(promptPayload());

    expect(seenSignal?.aborted).toBe(true);
  });

  it('retries once on a transient failure and reports the success', async () => {
    const { executor, stub } = buildExecutor({ GENERATION_MAX_ATTEMPTS: 2 });
    stub.enqueue({
      kind: 'error',
      error: LlmProviderError.transientFailure('503', 503),
    });

    const outcome = await executor.execute(promptPayload());

    expect(outcome.status).toBe('success');
    expect(outcome.attempts).toBe(2);
  });

  it('retries a timeout', async () => {
    const { executor, stub } = buildExecutor({
      GENERATION_TIMEOUT_MS: 20,
      GENERATION_MAX_ATTEMPTS: 2,
    });
    stub.enqueue({ kind: 'hang' });

    const outcome = await executor.execute(promptPayload());

    expect(outcome.status).toBe('success');
    expect(outcome.attempts).toBe(2);
  });

  it('never retries a 4xx', async () => {
    const { executor, stub } = buildExecutor({ GENERATION_MAX_ATTEMPTS: 2 });
    stub.enqueueRepeated(
      {
        kind: 'error',
        error: LlmProviderError.permanentFailure('bad request', 400),
      },
      2,
    );

    const outcome = await executor.execute(promptPayload());

    expect(outcome.status).toBe('error');
    expect(outcome.attempts).toBe(1);
    expect(stub.received).toHaveLength(1);
    if (outcome.status === 'error') {
      expect(outcome.transient).toBe(false);
    }
  });

  it('never retries a refusal, and marks it as one', async () => {
    const { executor, stub } = buildExecutor({ GENERATION_MAX_ATTEMPTS: 2 });
    stub.enqueue({
      kind: 'error',
      error: LlmProviderError.refusal('content filter', 400),
    });

    const outcome = await executor.execute(promptPayload());

    expect(outcome.status).toBe('error');
    expect(outcome.attempts).toBe(1);
    if (outcome.status === 'error') {
      expect(outcome.refused).toBe(true);
      expect(outcome.transient).toBe(false);
    }
  });

  it('never retries an error the adapter did not classify, since that is our bug not theirs', async () => {
    const { executor, stub } = buildExecutor({ GENERATION_MAX_ATTEMPTS: 2 });
    stub.enqueue({
      kind: 'error',
      error: new TypeError('cannot read property of undefined'),
    });

    const outcome = await executor.execute(promptPayload());

    expect(outcome.attempts).toBe(1);
    if (outcome.status === 'error') {
      expect(outcome.transient).toBe(false);
    }
  });

  it('gives up after the configured attempts', async () => {
    const { executor, stub } = buildExecutor({ GENERATION_MAX_ATTEMPTS: 2 });
    stub.enqueueRepeated(
      { kind: 'error', error: LlmProviderError.transientFailure('503', 503) },
      5,
    );

    const outcome = await executor.execute(promptPayload());

    expect(outcome.status).toBe('error');
    expect(outcome.attempts).toBe(2);
    expect(stub.received).toHaveLength(2);
    if (outcome.status === 'error') {
      expect(outcome.transient).toBe(true);
    }
  });
});
