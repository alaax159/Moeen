import type { RejectedCandidate } from './rejected-candidate';

/**
 * Where refused generations go.
 *
 * Two properties the finalizer relies on, and any implementation has to keep:
 *
 * 1. `retain` never rejects. A store that throws must swallow and log. The
 *    patient's answer is already rendered by the time this is called, and
 *    losing a review record is an inconvenience while losing the answer is a
 *    safety event.
 *
 * 2. Nothing it holds is ever read back into a response. This is a review
 *    queue, not a cache — the retained text failed the rules, and the only
 *    thing that may happen to it is a human reading it.
 */
export interface RejectedCandidateStorePort {
  retain(candidate: RejectedCandidate): Promise<void>;
}

export const REJECTED_CANDIDATE_STORE = Symbol('REJECTED_CANDIDATE_STORE');
