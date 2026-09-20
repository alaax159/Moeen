import { PublicEmergencyRateLimiter } from './public-emergency-rate-limiter.service';

describe('PublicEmergencyRateLimiter', () => {
  const config = (values: Record<string, string | undefined>) => ({
    get: jest.fn((key: string) => values[key]),
  });

  it('enforces the configured fixed-window limit and resets afterward', () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const limiter = new PublicEmergencyRateLimiter(
      config({
        EMERGENCY_PUBLIC_RATE_LIMIT: '2',
        EMERGENCY_PUBLIC_RATE_WINDOW_MS: '1000',
      }) as never,
    );

    expect(limiter.consume('127.0.0.1')).toEqual({ allowed: true });
    expect(limiter.consume('127.0.0.1')).toEqual({ allowed: true });
    expect(limiter.consume('127.0.0.1')).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });

    jest.setSystemTime(2_001);
    expect(limiter.consume('127.0.0.1')).toEqual({ allowed: true });
    jest.useRealTimers();
  });

  it('rejects unsafe configuration instead of silently weakening protection', () => {
    expect(
      () =>
        new PublicEmergencyRateLimiter(
          config({ EMERGENCY_PUBLIC_RATE_LIMIT: '0' }) as never,
        ),
    ).toThrow('Emergency public rate-limit configuration is invalid');
  });
});
