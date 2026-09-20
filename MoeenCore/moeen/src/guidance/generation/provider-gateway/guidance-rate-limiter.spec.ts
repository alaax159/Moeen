import { GuidanceRateLimiter } from './guidance-rate-limiter.service';
import { testGenerationConfig } from './provider-gateway.fixtures';

const WINDOW_MS = 60_000;

function buildLimiter(
  patientLimit: number,
  globalLimit: number,
): GuidanceRateLimiter {
  return new GuidanceRateLimiter(
    testGenerationConfig({
      GENERATION_PATIENT_RATE_LIMIT: patientLimit,
      GENERATION_PATIENT_RATE_WINDOW_MS: WINDOW_MS,
      GENERATION_GLOBAL_RATE_LIMIT: globalLimit,
      GENERATION_GLOBAL_RATE_WINDOW_MS: WINDOW_MS,
    }),
  );
}

describe('GuidanceRateLimiter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('allows a patient up to their limit and then holds', () => {
    const limiter = buildLimiter(3, 100);

    expect(limiter.tryConsume(1).allowed).toBe(true);
    expect(limiter.tryConsume(1).allowed).toBe(true);
    expect(limiter.tryConsume(1).allowed).toBe(true);

    const blocked = limiter.tryConsume(1);
    expect(blocked).toMatchObject({ allowed: false, scope: 'patient' });
  });

  it('holds one patient without touching another', () => {
    const limiter = buildLimiter(2, 100);

    limiter.tryConsume(1);
    limiter.tryConsume(1);
    expect(limiter.tryConsume(1).allowed).toBe(false);

    expect(limiter.tryConsume(2).allowed).toBe(true);
  });

  it('lets the patient through again once their window slides past', () => {
    const limiter = buildLimiter(2, 100);

    limiter.tryConsume(1);
    limiter.tryConsume(1);
    expect(limiter.tryConsume(1).allowed).toBe(false);

    jest.advanceTimersByTime(WINDOW_MS + 1);

    expect(limiter.tryConsume(1).allowed).toBe(true);
  });

  it('reports how long the patient has to wait', () => {
    const limiter = buildLimiter(1, 100);

    limiter.tryConsume(1);
    jest.advanceTimersByTime(10_000);
    const blocked = limiter.tryConsume(1);

    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterMs).toBe(WINDOW_MS - 10_000);
    }
  });

  it('holds at the global limit even when no single patient is over theirs', () => {
    const limiter = buildLimiter(100, 3);

    expect(limiter.tryConsume(1).allowed).toBe(true);
    expect(limiter.tryConsume(2).allowed).toBe(true);
    expect(limiter.tryConsume(3).allowed).toBe(true);

    expect(limiter.tryConsume(4)).toMatchObject({
      allowed: false,
      scope: 'global',
    });
  });

  it('does not spend a patient slot on a call the global limit refuses', () => {
    // A short global window against a long patient window, so the global limit
    // can recover while the patient limit is still holding its history.
    const limiter = new GuidanceRateLimiter(
      testGenerationConfig({
        GENERATION_PATIENT_RATE_LIMIT: 1,
        GENERATION_PATIENT_RATE_WINDOW_MS: WINDOW_MS,
        GENERATION_GLOBAL_RATE_LIMIT: 1,
        GENERATION_GLOBAL_RATE_WINDOW_MS: 1_000,
      }),
    );

    limiter.tryConsume(1);
    expect(limiter.tryConsume(2)).toMatchObject({
      allowed: false,
      scope: 'global',
    });

    jest.advanceTimersByTime(1_001);

    // Patient 2 was turned away by a system limit, not by their own usage, so
    // their one allowed call must still be there. If the global check had
    // consumed it first, this would come back refused with scope 'patient'.
    expect(limiter.tryConsume(2).allowed).toBe(true);
  });

  it('applies only the global limit when no patient is identified', () => {
    const limiter = buildLimiter(1, 2);

    expect(limiter.tryConsume(undefined).allowed).toBe(true);
    expect(limiter.tryConsume(undefined).allowed).toBe(true);
    expect(limiter.tryConsume(undefined)).toMatchObject({
      allowed: false,
      scope: 'global',
    });
  });

  it('forgets patients who stopped asking, so the map does not grow forever', () => {
    const limiter = buildLimiter(5, 1000);

    for (let patientId = 1; patientId <= 50; patientId += 1) {
      limiter.tryConsume(patientId);
    }
    expect(limiter.trackedPatientCount).toBe(50);

    jest.advanceTimersByTime(WINDOW_MS + 1);
    limiter.tryConsume(1);

    // 49 patients never came back, so nothing would ever touch their entries
    // again. The sweep is what stops them accumulating for the life of the
    // process.
    expect(limiter.trackedPatientCount).toBe(1);
  });
});
