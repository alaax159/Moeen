import { Logger } from '@nestjs/common';

import { RedactionFailedError } from '../../context/redactor/redaction-failed.error';
import {
  RedactablePayload,
  RedactorPort,
} from '../../context/redactor/redactor.port';
import { LlmProviderError } from './llm-provider.error';
import { GenerationCallContext } from './provider-gateway.port';
import {
  buildGatewayHarness,
  GenerationConfigOverrides,
  promptPayload,
} from './provider-gateway.fixtures';

const PATIENT: GenerationCallContext = { patientId: 42, intent: 'missed_dose' };
const NO_ONE = {};

function harness(overrides: GenerationConfigOverrides = {}) {
  return buildGatewayHarness(overrides);
}

/**
 * The GN-2 T2 acceptance list, end to end through the real gateway and the
 * stub provider. Nothing here touches a network.
 *
 * The property under test throughout is the same one: whatever the provider
 * does, dispatch() returns. Salam's orchestrator has to be able to answer the
 * patient from the deterministic findings, and it can only do that if a bad
 * provider day arrives as a value it can branch on.
 */
describe('ProviderGateway resilience', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('the kill switch', () => {
    it('returns a usable result and contacts no provider', async () => {
      const { gateway, stub } = harness({ GENERATION_ENABLED: 'false' });

      const result = await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);

      expect(result.outcome).toBe('fallback_required');
      expect(result.failure?.reason).toBe('disabled');
      expect(result.text).toBe('');
      expect(stub.received).toHaveLength(0);
    });

    it('does not throw, so nothing upstream breaks', async () => {
      const { gateway } = harness({ GENERATION_ENABLED: 'false' });

      await expect(
        gateway.dispatch(promptPayload(), NO_ONE, PATIENT),
      ).resolves.toBeDefined();
    });

    it('records no guidance_call row, because no call was made and no cost incurred', async () => {
      const { gateway, recorder } = harness({ GENERATION_ENABLED: 'false' });

      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);

      expect(recorder.rows).toHaveLength(0);
    });
  });

  describe('timeouts', () => {
    it('produce a typed failure rather than a crash', async () => {
      const { gateway, stub } = harness({
        GENERATION_TIMEOUT_MS: 20,
        GENERATION_MAX_ATTEMPTS: 1,
      });
      stub.enqueue({ kind: 'hang' });

      const result = await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);

      expect(result.outcome).toBe('fallback_required');
      expect(result.failure).toMatchObject({
        reason: 'timeout',
        retryable: true,
      });
    });

    it('are recorded with their own status and no token counts', async () => {
      const { gateway, stub, recorder } = harness({
        GENERATION_TIMEOUT_MS: 20,
        GENERATION_MAX_ATTEMPTS: 1,
      });
      stub.enqueue({ kind: 'hang' });

      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);

      expect(recorder.rows[0]).toMatchObject({
        patientId: 42,
        intent: 'missed_dose',
        status: 'timeout',
        tokensIn: null,
        tokensOut: null,
      });
    });
  });

  describe('the circuit breaker', () => {
    const OPENING = {
      GENERATION_BREAKER_FAILURE_THRESHOLD: 2,
      GENERATION_BREAKER_COOLDOWN_MS: 30_000,
      GENERATION_MAX_ATTEMPTS: 1,
      GENERATION_GLOBAL_RATE_LIMIT: 1_000,
      GENERATION_PATIENT_RATE_LIMIT: 1_000,
    };

    it('opens after repeated failures and then short-circuits without calling the provider', async () => {
      const { gateway, stub } = harness(OPENING);
      stub.enqueueRepeated(
        { kind: 'error', error: LlmProviderError.transientFailure('503', 503) },
        2,
      );

      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
      const shortCircuited = await gateway.dispatch(
        promptPayload(),
        NO_ONE,
        PATIENT,
      );

      expect(shortCircuited.failure?.reason).toBe('circuit_open');
      // Two attempts reached the provider; the third never did.
      expect(stub.received).toHaveLength(2);
    });

    it('closes again when the probe after the cooldown succeeds', async () => {
      jest.useFakeTimers();
      try {
        const { gateway, stub } = harness(OPENING);
        stub.enqueueRepeated(
          {
            kind: 'error',
            error: LlmProviderError.transientFailure('503', 503),
          },
          2,
        );

        await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
        await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
        expect(
          (await gateway.dispatch(promptPayload(), NO_ONE, PATIENT)).failure
            ?.reason,
        ).toBe('circuit_open');

        jest.advanceTimersByTime(30_000);

        const probe = await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
        expect(probe.outcome).toBe('generated');

        const afterRecovery = await gateway.dispatch(
          promptPayload(),
          NO_ONE,
          PATIENT,
        );
        expect(afterRecovery.outcome).toBe('generated');
      } finally {
        jest.useRealTimers();
      }
    });

    it('records a circuit_open row so the outage is visible in the call ledger', async () => {
      const { gateway, stub, recorder } = harness(OPENING);
      stub.enqueueRepeated(
        { kind: 'error', error: LlmProviderError.transientFailure('503', 503) },
        2,
      );

      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);

      expect(recorder.rows.map((row) => row.status)).toEqual([
        'error',
        'error',
        'circuit_open',
      ]);
    });

    it('is not opened by refusals, which are a healthy provider saying no', async () => {
      const { gateway, stub } = harness(OPENING);
      stub.enqueueRepeated(
        {
          kind: 'error',
          error: LlmProviderError.refusal('content filter', 400),
        },
        3,
      );

      const first = await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
      const third = await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);

      expect(first.failure?.reason).toBe('refused');
      expect(third.failure?.reason).toBe('refused');
      expect(stub.received).toHaveLength(3);
    });

    it('is not opened by permanent provider errors', async () => {
      const { gateway, stub, breaker } = harness(OPENING);
      stub.enqueueRepeated(
        {
          kind: 'error',
          error: LlmProviderError.permanentFailure('bad request', 400),
        },
        3,
      );

      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);

      expect(breaker.snapshot().state).toBe('closed');
      expect(stub.received).toHaveLength(3);
    });

    it('is not opened by unclassified application errors', async () => {
      const { gateway, stub, breaker } = harness(OPENING);
      stub.enqueueRepeated(
        { kind: 'error', error: new TypeError('adapter bug') },
        3,
      );

      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);

      expect(breaker.snapshot().state).toBe('closed');
      expect(stub.received).toHaveLength(3);
    });

    it('does not count a rate-limited half-open probe as recovery', async () => {
      jest.useFakeTimers();
      try {
        const { gateway, stub, breaker, rateLimiter } = harness({
          ...OPENING,
          GENERATION_PATIENT_RATE_LIMIT: 1,
        });
        expect(rateLimiter.tryConsume(PATIENT.patientId).allowed).toBe(true);
        for (
          let i = 0;
          i < OPENING.GENERATION_BREAKER_FAILURE_THRESHOLD;
          i += 1
        ) {
          expect(breaker.tryAcquire()).toBe(true);
          breaker.recordFailure();
        }
        jest.advanceTimersByTime(OPENING.GENERATION_BREAKER_COOLDOWN_MS);

        const result = await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);

        expect(result.failure?.reason).toBe('rate_limited');
        expect(stub.received).toHaveLength(0);
        expect(breaker.snapshot().state).toBe('half_open');
        expect(breaker.tryAcquire()).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('releases a half-open probe when the prompt is invalid', async () => {
      jest.useFakeTimers();
      try {
        const { gateway, stub, breaker } = harness(OPENING);
        for (
          let i = 0;
          i < OPENING.GENERATION_BREAKER_FAILURE_THRESHOLD;
          i += 1
        ) {
          expect(breaker.tryAcquire()).toBe(true);
          breaker.recordFailure();
        }
        jest.advanceTimersByTime(OPENING.GENERATION_BREAKER_COOLDOWN_MS);

        const result = await gateway.dispatch(
          { note: 'no prompts here' },
          NO_ONE,
          PATIENT,
        );

        expect(result.failure?.reason).toBe('invalid_prompt_payload');
        expect(stub.received).toHaveLength(0);
        expect(breaker.snapshot().state).toBe('half_open');
        expect(breaker.tryAcquire()).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('releases a half-open probe when redaction aborts the call', async () => {
      jest.useFakeTimers();
      try {
        const failingRedactor: RedactorPort = {
          redact: <T extends RedactablePayload>(): T => {
            throw new RedactionFailedError('cannot guarantee redaction');
          },
        };
        const { gateway, stub, breaker } = buildGatewayHarness(
          OPENING,
          failingRedactor,
        );
        for (
          let i = 0;
          i < OPENING.GENERATION_BREAKER_FAILURE_THRESHOLD;
          i += 1
        ) {
          expect(breaker.tryAcquire()).toBe(true);
          breaker.recordFailure();
        }
        jest.advanceTimersByTime(OPENING.GENERATION_BREAKER_COOLDOWN_MS);

        await expect(
          gateway.dispatch(promptPayload(), NO_ONE, PATIENT),
        ).rejects.toThrow(RedactionFailedError);

        expect(stub.received).toHaveLength(0);
        expect(breaker.snapshot().state).toBe('half_open');
        expect(breaker.tryAcquire()).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('rate limits', () => {
    it('hold per patient', async () => {
      const { gateway } = harness({
        GENERATION_PATIENT_RATE_LIMIT: 2,
        GENERATION_GLOBAL_RATE_LIMIT: 1_000,
      });

      expect(
        (await gateway.dispatch(promptPayload(), NO_ONE, PATIENT)).outcome,
      ).toBe('generated');
      expect(
        (await gateway.dispatch(promptPayload(), NO_ONE, PATIENT)).outcome,
      ).toBe('generated');

      const blocked = await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
      expect(blocked.failure).toMatchObject({
        reason: 'rate_limited',
        retryable: true,
      });
      expect(blocked.failure?.retryAfterMs).toBeGreaterThan(0);
    });

    it('hold one patient without holding another', async () => {
      const { gateway } = harness({
        GENERATION_PATIENT_RATE_LIMIT: 1,
        GENERATION_GLOBAL_RATE_LIMIT: 1_000,
      });

      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
      expect(
        (await gateway.dispatch(promptPayload(), NO_ONE, PATIENT)).outcome,
      ).toBe('fallback_required');

      const other = await gateway.dispatch(promptPayload(), NO_ONE, {
        patientId: 99,
        intent: 'missed_dose',
      });
      expect(other.outcome).toBe('generated');
    });

    it('hold globally', async () => {
      const { gateway } = harness({
        GENERATION_PATIENT_RATE_LIMIT: 1_000,
        GENERATION_GLOBAL_RATE_LIMIT: 1,
      });

      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
      const blocked = await gateway.dispatch(promptPayload(), NO_ONE, {
        patientId: 7,
        intent: 'explain_finding',
      });

      expect(blocked.failure?.reason).toBe('rate_limited');
    });

    it('do not leave the breaker holding a probe it will never resolve', async () => {
      const { gateway, breaker } = harness({
        GENERATION_PATIENT_RATE_LIMIT: 1,
        GENERATION_GLOBAL_RATE_LIMIT: 1_000,
      });

      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);
      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);

      expect(breaker.snapshot().state).toBe('closed');
    });
  });

  describe('usage recording', () => {
    it('writes a row per call with tokens, latency and status', async () => {
      const { gateway, recorder } = harness();

      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);

      expect(recorder.rows).toHaveLength(1);
      const row = recorder.rows[0];
      expect(row.patientId).toBe(42);
      expect(row.intent).toBe('missed_dose');
      expect(row.status).toBe('success');
      expect(row.tokensIn).toBeGreaterThan(0);
      expect(row.tokensOut).toBeGreaterThan(0);
      expect(row.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns the same usage to the caller that it recorded', async () => {
      const { gateway, recorder } = harness();

      const result = await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);

      expect(result.usage).toEqual({
        promptTokens: recorder.rows[0].tokensIn,
        completionTokens: recorder.rows[0].tokensOut,
      });
    });

    it('writes one row per dispatch, not one per retry, so the count matches calls the patient made', async () => {
      const { gateway, stub, recorder } = harness({
        GENERATION_MAX_ATTEMPTS: 2,
      });
      stub.enqueue({
        kind: 'error',
        error: LlmProviderError.transientFailure('503', 503),
      });

      await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);

      expect(stub.received).toHaveLength(2);
      expect(recorder.rows).toHaveLength(1);
      expect(recorder.rows[0].status).toBe('success');
    });

    it('skips the row, loudly, when the caller supplied no context to key it by', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const { gateway, recorder } = harness();

      const result = await gateway.dispatch(promptPayload(), NO_ONE);

      expect(result.outcome).toBe('generated');
      expect(recorder.rows).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('guidance_call not recorded'),
      );
    });
  });

  describe('a payload that is not a prompt', () => {
    it('is refused with a typed failure and never reaches the provider', async () => {
      const { gateway, stub } = harness();

      const result = await gateway.dispatch(
        { note: 'no prompts here' },
        NO_ONE,
        PATIENT,
      );

      expect(result.failure?.reason).toBe('invalid_prompt_payload');
      expect(result.failure?.retryable).toBe(false);
      expect(stub.received).toHaveLength(0);
    });

    it('does not open the circuit, because it is our bug and not the provider being unhealthy', async () => {
      const { gateway, breaker } = harness({
        GENERATION_BREAKER_FAILURE_THRESHOLD: 2,
      });

      await gateway.dispatch({ note: 'x' }, NO_ONE, PATIENT);
      await gateway.dispatch({ note: 'x' }, NO_ONE, PATIENT);

      expect(breaker.snapshot().state).toBe('closed');
    });
  });

  it('never rejects for a provider problem, whatever the provider does', async () => {
    const failures = [
      {
        kind: 'error' as const,
        error: LlmProviderError.transientFailure('503', 503),
      },
      {
        kind: 'error' as const,
        error: LlmProviderError.permanentFailure('400', 400),
      },
      {
        kind: 'error' as const,
        error: LlmProviderError.refusal('filtered', 400),
      },
      { kind: 'error' as const, error: new TypeError('adapter bug') },
    ];

    for (const failure of failures) {
      const { gateway, stub } = harness({ GENERATION_MAX_ATTEMPTS: 1 });
      stub.enqueue(failure);

      const result = await gateway.dispatch(promptPayload(), NO_ONE, PATIENT);

      expect(result.outcome).toBe('fallback_required');
      expect(result.text).toBe('');
      expect(result.failure).toBeDefined();
    }
  });
});
