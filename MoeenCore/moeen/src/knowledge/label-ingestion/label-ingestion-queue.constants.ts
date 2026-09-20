import { createHash } from 'node:crypto';

import { EmbeddingProfile } from '../label-processing/embedding-provider';

export const LABEL_INGESTION_QUEUE = 'label-ingestion';

export const FETCH_LABEL_JOB = 'fetch-label';

export type FetchLabelJobData = {
  medicationId: number;
  dailyMedSetId: string;
};

/**
 * Enqueued after a fetch succeeds — split into its own job (not inlined
 * into fetch-label's handler) so a splitter/embedding bug retries the
 * cheap local re-processing step, not a duplicate DailyMed API call.
 * Carries only ids, not the raw content itself, to keep job payloads
 * small — the processor re-reads rawContent from label_document.
 */
export const PROCESS_LABEL_JOB = 'process-label';

export type ProcessLabelJobData = {
  medicationId: number;
  setId: string;
  labelVersion: string;
  /** Optional only for jobs queued before embedding profiles were introduced. */
  embeddingProfile?: EmbeddingProfile;
};

export type LabelIngestionJobData = FetchLabelJobData | ProcessLabelJobData;

/**
 * Includes the active vector-space profile so a completed job retained by
 * BullMQ cannot suppress reprocessing after a model/preprocessing upgrade.
 */
export function processLabelJobId(
  setId: string,
  labelVersion: string,
  profile: EmbeddingProfile,
): string {
  const profileHash = createHash('sha256')
    .update(`${profile.model}\0${profile.version}\0${profile.dimensions}`)
    .digest('hex')
    .slice(0, 16);
  return `${PROCESS_LABEL_JOB}-${setId}-${labelVersion}-${profileHash}`;
}
