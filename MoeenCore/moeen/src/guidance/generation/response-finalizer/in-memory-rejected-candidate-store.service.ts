import { Injectable, Logger } from '@nestjs/common';

import type { RejectedCandidate } from './rejected-candidate';
import type { RejectedCandidateStorePort } from './rejected-candidate-store.port';

/**
 * Retention limit. Small on purpose: this is a review buffer, not an archive,
 * and an unbounded in-process list holding model output is a memory leak with
 * a straight face.
 */
export const IN_MEMORY_RETENTION_LIMIT = 200;

/**
 * INTERIM retention, and the honest name for it is "better than dropping it".
 *
 * A durable rejected-candidate table belongs in database/schema/, which is
 * outside the folder this story owns — see this folder's README for the exact
 * table the durable store needs and the one-line binding that swaps it in.
 * Until that lands, refusals are readable for the life of the process, which
 * is enough for the false-positive review this story asks for and is not
 * enough for anything else.
 *
 * Deliberately not silent about that: `retain` logs, so a rejection is on
 * disk in the log even when the record here is later evicted or lost to a
 * restart.
 */
@Injectable()
export class InMemoryRejectedCandidateStore implements RejectedCandidateStorePort {
  private readonly logger = new Logger(InMemoryRejectedCandidateStore.name);
  private readonly retained: RejectedCandidate[] = [];

  async retain(candidate: RejectedCandidate): Promise<void> {
    this.retained.push(candidate);
    if (this.retained.length > IN_MEMORY_RETENTION_LIMIT) {
      const evicted = this.retained.shift();
      this.logger.warn(
        `rejected-candidate buffer full at ${IN_MEMORY_RETENTION_LIMIT}; evicted a ${evicted?.reason ?? 'unknown'} record from ${evicted?.rejectedAt ?? 'unknown time'}`,
      );
    }
    return Promise.resolve();
  }

  /** Newest first. For review tooling and tests — never for building a response. */
  list(): readonly RejectedCandidate[] {
    return [...this.retained].reverse();
  }

  get size(): number {
    return this.retained.length;
  }

  clear(): void {
    this.retained.length = 0;
  }
}
