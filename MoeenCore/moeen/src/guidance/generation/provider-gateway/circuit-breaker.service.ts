import { Injectable, Logger } from '@nestjs/common';
import { GenerationConfig } from './generation.config';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitSnapshot {
  state: CircuitState;
  consecutiveFailures: number;
}

/**
 * Stops us from hammering a provider that is already down, and — more to the
 * point — stops every patient in the queue from waiting out a full timeout
 * each while it is down.
 *
 * Recovery is by probe, not by clock: after the cooldown the breaker lets
 * exactly one call through and closes only if that call succeeds. A timer
 * alone would reopen the floodgates onto a provider that has not recovered.
 *
 * Only timeouts and transient failures count against it. A refusal is a valid
 * answer and a 4xx is our own mistake — neither says the provider is
 * unhealthy, and letting them trip the breaker would take generation down for
 * everyone over one malformed request.
 *
 * In-memory, so the state is per process. With more than one API instance each
 * keeps its own view; that is acceptable (each protects its own socket pool)
 * but worth revisiting alongside the rate limiter if we move to Redis.
 */
@Injectable()
export class CircuitBreaker {
  private readonly logger = new Logger(CircuitBreaker.name);

  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private probeSuccesses = 0;
  private probeInFlight = false;
  private openedAt = 0;

  constructor(private readonly config: GenerationConfig) {}

  /** True if this call may proceed. Half-open admits one probe at a time and no more. */
  tryAcquire(): boolean {
    if (this.state === 'closed') return true;

    if (this.state === 'open') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed < this.config.breakerCooldownMs) return false;

      this.state = 'half_open';
      this.probeSuccesses = 0;
      this.probeInFlight = true;
      this.logger.warn('generation circuit half-open: admitting one probe');
      return true;
    }

    if (this.probeInFlight) return false;

    this.probeInFlight = true;
    return true;
  }

  recordSuccess(): void {
    if (this.state === 'half_open') {
      this.probeInFlight = false;
      this.probeSuccesses += 1;

      if (this.probeSuccesses >= this.config.breakerProbeSuccesses) {
        this.close();
      }
      return;
    }

    this.consecutiveFailures = 0;
  }

  /**
   * Releases a half-open probe that never reached the provider.
   *
   * Local rejections and failures say nothing about provider health, so they
   * must neither close the circuit as a success nor reopen it as a failure.
   * Keeping the circuit half-open lets the next eligible request perform the
   * real recovery probe.
   */
  releaseProbe(): void {
    if (this.state === 'half_open') {
      this.probeInFlight = false;
    }
  }

  recordFailure(): void {
    if (this.state === 'half_open') {
      // The probe failed. Straight back to open with a fresh cooldown rather
      // than counting up to the threshold again from a half-open state.
      this.open();
      return;
    }

    if (this.state === 'open') return;

    this.consecutiveFailures += 1;

    if (this.consecutiveFailures >= this.config.breakerFailureThreshold) {
      this.open();
    }
  }

  snapshot(): CircuitSnapshot {
    return { state: this.state, consecutiveFailures: this.consecutiveFailures };
  }

  /** Test and boot hook. Never called on a request path. */
  reset(): void {
    this.close();
  }

  private open(): void {
    this.state = 'open';
    this.openedAt = Date.now();
    this.probeInFlight = false;
    this.probeSuccesses = 0;
    this.logger.error(
      `generation circuit open after ${this.consecutiveFailures} failures; cooling down for ${this.config.breakerCooldownMs}ms`,
    );
  }

  private close(): void {
    const wasOpen = this.state !== 'closed';
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.probeSuccesses = 0;
    this.probeInFlight = false;
    if (wasOpen) this.logger.log('generation circuit closed');
  }
}
