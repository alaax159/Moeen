import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RateWindow {
  count: number;
  expiresAt: number;
}

export interface PublicEmergencyRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
}

const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_MS = 60_000;
const MAX_CLIENTS = 10_000;

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) {
    throw new Error('Emergency public rate-limit configuration is invalid');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('Emergency public rate-limit configuration is invalid');
  }
  return parsed;
}

@Injectable()
export class PublicEmergencyRateLimiter {
  private readonly clients = new Map<string, RateWindow>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(config: ConfigService) {
    this.limit = positiveInteger(
      config.get<string>('EMERGENCY_PUBLIC_RATE_LIMIT'),
      DEFAULT_LIMIT,
    );
    this.windowMs = positiveInteger(
      config.get<string>('EMERGENCY_PUBLIC_RATE_WINDOW_MS'),
      DEFAULT_WINDOW_MS,
    );
  }

  consume(
    clientIp: string,
    now = Date.now(),
  ): PublicEmergencyRateLimitDecision {
    const existing = this.clients.get(clientIp);
    if (!existing || existing.expiresAt <= now) {
      if (!existing && this.clients.size >= MAX_CLIENTS) {
        const oldestClient = this.clients.keys().next().value as
          string | undefined;
        if (oldestClient) this.clients.delete(oldestClient);
      }
      this.clients.set(clientIp, { count: 1, expiresAt: now + this.windowMs });
      return { allowed: true };
    }

    if (existing.count >= this.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((existing.expiresAt - now) / 1000),
        ),
      };
    }

    existing.count += 1;
    return { allowed: true };
  }
}
