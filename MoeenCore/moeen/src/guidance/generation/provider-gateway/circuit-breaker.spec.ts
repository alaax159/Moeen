import { Logger } from '@nestjs/common';

import { CircuitBreaker } from './circuit-breaker.service';
import { testGenerationConfig } from './provider-gateway.fixtures';

const THRESHOLD = 3;
const COOLDOWN_MS = 30_000;

function buildBreaker(probeSuccesses = 1): CircuitBreaker {
  return new CircuitBreaker(
    testGenerationConfig({
      GENERATION_BREAKER_FAILURE_THRESHOLD: THRESHOLD,
      GENERATION_BREAKER_COOLDOWN_MS: COOLDOWN_MS,
      GENERATION_BREAKER_PROBE_SUCCESSES: probeSuccesses,
    }),
  );
}

function fail(breaker: CircuitBreaker, times: number): void {
  for (let i = 0; i < times; i += 1) {
    expect(breaker.tryAcquire()).toBe(true);
    breaker.recordFailure();
  }
}

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Opening and closing the circuit is logged loudly on purpose. A passing
    // run should not read like an incident.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('stays closed while calls succeed', () => {
    const breaker = buildBreaker();

    for (let i = 0; i < 10; i += 1) {
      expect(breaker.tryAcquire()).toBe(true);
      breaker.recordSuccess();
    }

    expect(breaker.snapshot().state).toBe('closed');
  });

  it('opens once failures reach the threshold, and refuses calls while open', () => {
    const breaker = buildBreaker();

    fail(breaker, THRESHOLD);

    expect(breaker.snapshot().state).toBe('open');
    expect(breaker.tryAcquire()).toBe(false);
  });

  it('counts consecutively — a success in between resets the run', () => {
    const breaker = buildBreaker();

    fail(breaker, THRESHOLD - 1);
    breaker.tryAcquire();
    breaker.recordSuccess();
    fail(breaker, THRESHOLD - 1);

    expect(breaker.snapshot().state).toBe('closed');
  });

  it('stays open for the whole cooldown', () => {
    const breaker = buildBreaker();
    fail(breaker, THRESHOLD);

    jest.advanceTimersByTime(COOLDOWN_MS - 1);

    expect(breaker.tryAcquire()).toBe(false);
  });

  it('admits exactly one probe after the cooldown, not a flood', () => {
    const breaker = buildBreaker();
    fail(breaker, THRESHOLD);

    jest.advanceTimersByTime(COOLDOWN_MS);

    expect(breaker.tryAcquire()).toBe(true);
    expect(breaker.snapshot().state).toBe('half_open');
    // The probe is still in flight; nothing else gets through behind it.
    expect(breaker.tryAcquire()).toBe(false);
  });

  it('closes when the probe succeeds', () => {
    const breaker = buildBreaker();
    fail(breaker, THRESHOLD);
    jest.advanceTimersByTime(COOLDOWN_MS);

    breaker.tryAcquire();
    breaker.recordSuccess();

    expect(breaker.snapshot().state).toBe('closed');
    expect(breaker.tryAcquire()).toBe(true);
  });

  it('releases an unused probe without counting it as a success', () => {
    const breaker = buildBreaker();
    fail(breaker, THRESHOLD);
    jest.advanceTimersByTime(COOLDOWN_MS);

    expect(breaker.tryAcquire()).toBe(true);
    breaker.releaseProbe();

    expect(breaker.snapshot().state).toBe('half_open');
    expect(breaker.tryAcquire()).toBe(true);
  });

  it('does not erase qualifying failures when a closed-state call is neutral', () => {
    const breaker = buildBreaker();
    fail(breaker, THRESHOLD - 1);

    expect(breaker.tryAcquire()).toBe(true);
    breaker.releaseProbe();
    expect(breaker.snapshot().consecutiveFailures).toBe(THRESHOLD - 1);

    expect(breaker.tryAcquire()).toBe(true);
    breaker.recordFailure();
    expect(breaker.snapshot().state).toBe('open');
  });

  it('goes straight back to open, with a fresh cooldown, when the probe fails', () => {
    const breaker = buildBreaker();
    fail(breaker, THRESHOLD);
    jest.advanceTimersByTime(COOLDOWN_MS);

    breaker.tryAcquire();
    breaker.recordFailure();

    expect(breaker.snapshot().state).toBe('open');
    expect(breaker.tryAcquire()).toBe(false);

    jest.advanceTimersByTime(COOLDOWN_MS);
    expect(breaker.tryAcquire()).toBe(true);
  });

  it('needs every configured probe success before it closes', () => {
    const breaker = buildBreaker(2);
    fail(breaker, THRESHOLD);
    jest.advanceTimersByTime(COOLDOWN_MS);

    breaker.tryAcquire();
    breaker.recordSuccess();
    expect(breaker.snapshot().state).toBe('half_open');

    breaker.tryAcquire();
    breaker.recordSuccess();
    expect(breaker.snapshot().state).toBe('closed');
  });
});
