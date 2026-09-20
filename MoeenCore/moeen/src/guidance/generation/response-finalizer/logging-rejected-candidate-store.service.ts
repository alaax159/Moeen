import { Injectable, Logger } from '@nestjs/common';

import type { RejectedCandidate } from './rejected-candidate';
import type { RejectedCandidateStorePort } from './rejected-candidate-store.port';

/**
 * Writes the whole refused candidate to the application log and keeps
 * nothing.
 *
 * The alternative for environments where holding model output in process
 * memory is not wanted, and the fallback if the in-memory buffer is ever
 * judged too lossy to be worth having. Not the default: log retention is
 * whatever the platform's retention happens to be, and grepping logs is a
 * poor substitute for a queryable review queue.
 */
@Injectable()
export class LoggingRejectedCandidateStore implements RejectedCandidateStorePort {
  private readonly logger = new Logger(LoggingRejectedCandidateStore.name);

  async retain(candidate: RejectedCandidate): Promise<void> {
    this.logger.warn(
      JSON.stringify({
        event: 'guidance.candidate_rejected',
        reason: candidate.reason,
        intent: candidate.intent,
        promptVersion: candidate.promptVersion,
        rejectedAt: candidate.rejectedAt,
        codes: candidate.violations.map((violation) => violation.code),
        citedIds: candidate.citedIds,
        suppliedCitationIds: candidate.suppliedCitationIds,
        candidateText: candidate.candidateText,
      }),
    );
    return Promise.resolve();
  }
}
