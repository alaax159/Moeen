import { Injectable } from '@nestjs/common';
import { GenerationConfig } from './generation.config';

export type RateLimitScope = 'patient' | 'global';

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; scope: RateLimitScope; retryAfterMs: number };

/**
 * Two limits, both configurable: one per patient, one across the whole
 * process.
 *
 * The per-patient limit is the one that protects the patient — a client stuck
 * in a retry loop, or a screen that re-requests on every render, should cost
 * that patient's quota and nobody else's. The global limit is what keeps us
 * under the provider's own quota, so we return our own typed failure instead
 * of collecting 429s.
 *
 * Sliding window over kept timestamps rather than a fixed bucket, so a burst
 * straddling a window boundary cannot spend two windows' worth of calls at
 * once.
 *
 * In-memory, so limits are per process: with N instances the effective global
 * limit is N x the configured value. Redis is already in this stack and is the
 * obvious home for a shared counter — deliberately left for when we actually
 * run more than one instance, rather than adding a network round trip to every
 * guidance request today.
 */
@Injectable()
export class GuidanceRateLimiter {
  private readonly patientHits = new Map<number, number[]>();
  private globalHits: number[] = [];
  private lastSweptAt = 0;

  constructor(private readonly config: GenerationConfig) {}

  /** How many patients are currently being tracked. Observability, and the handle the sweep is asserted through. */
  get trackedPatientCount(): number {
    return this.patientHits.size;
  }

  /**
   * Consumes one slot if both limits allow it. A patientId is optional because
   * the gateway's call context is optional; without one only the global limit
   * applies, which is a weaker guarantee and is logged by the caller.
   */
  tryConsume(patientId?: number): RateLimitDecision {
    const now = Date.now();

    const globalWindow = this.config.globalRateWindowMs;
    const patientWindow = this.config.patientRateWindowMs;

    this.sweepExpiredPatients(now, patientWindow);
    this.globalHits = prune(this.globalHits, now, globalWindow);

    const patientHits =
      patientId === undefined
        ? undefined
        : prune(this.patientHits.get(patientId) ?? [], now, patientWindow);

    // Both limits are checked before either is consumed — a call rejected by
    // the global limit must not have already spent the patient's quota.
    if (patientHits && patientHits.length >= this.config.patientRateLimit) {
      this.store(patientId as number, patientHits);
      return {
        allowed: false,
        scope: 'patient',
        retryAfterMs: retryAfter(patientHits, now, patientWindow),
      };
    }

    if (this.globalHits.length >= this.config.globalRateLimit) {
      if (patientHits) this.store(patientId as number, patientHits);
      return {
        allowed: false,
        scope: 'global',
        retryAfterMs: retryAfter(this.globalHits, now, globalWindow),
      };
    }

    this.globalHits.push(now);
    if (patientHits) {
      patientHits.push(now);
      this.store(patientId as number, patientHits);
    }

    return { allowed: true };
  }

  /** Test and boot hook. Never called on a request path. */
  reset(): void {
    this.patientHits.clear();
    this.globalHits = [];
    this.lastSweptAt = 0;
  }

  private store(patientId: number, hits: number[]): void {
    if (hits.length === 0) {
      this.patientHits.delete(patientId);
      return;
    }
    this.patientHits.set(patientId, hits);
  }

  /**
   * Without this the map keeps one entry per patient who ever asked a
   * question, because a patient who never comes back is never touched again
   * and so never pruned. Runs at most once per window, so the cost is
   * amortised to nothing on a request path.
   */
  private sweepExpiredPatients(now: number, windowMs: number): void {
    if (now - this.lastSweptAt < windowMs) return;
    this.lastSweptAt = now;

    const cutoff = now - windowMs;
    for (const [patientId, hits] of this.patientHits) {
      const newest = hits[hits.length - 1];
      if (newest === undefined || newest <= cutoff) {
        this.patientHits.delete(patientId);
      }
    }
  }
}

function prune(hits: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  return hits.filter((at) => at > cutoff);
}

function retryAfter(hits: number[], now: number, windowMs: number): number {
  const oldest = hits[0];
  if (oldest === undefined) return 0;
  return Math.max(0, oldest + windowMs - now);
}
