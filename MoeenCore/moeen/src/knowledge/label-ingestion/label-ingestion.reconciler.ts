import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  FETCH_LABEL_JOB,
  LabelIngestionJobData,
  LABEL_INGESTION_QUEUE,
  PROCESS_LABEL_JOB,
  processLabelJobId,
} from './label-ingestion-queue.constants';
import { LabelDocumentRepository } from './label-document.repository';
import { stripDailyMedPrefix } from '../../database/daily-med-id.util';
import { LabelProcessingService } from '../label-processing/label-processing.service';

/**
 * Boot-time reconciliation for MedicationVerifiedEvent — same pattern as
 * DoseNotificationBootstrap, applied to the equivalent gap: the event bus
 * is in-memory only, so an event lost between the medication transaction
 * committing and the fetch job actually landing in Redis (process crash,
 * or queue.add() itself throwing) would otherwise be lost forever, since
 * a verified medication never re-fires the event. Periodic (not just
 * boot-time) reconciliation was considered and deliberately deferred —
 * this codebase has no existing @Cron precedent, and boot-time covers the
 * crash case, which is the one raised in review.
 */
// The same pass also schedules local reprocessing for fetched documents whose
// chunks do not match the active embedding profile; it never refetches SPL.
@Injectable()
export class LabelIngestionReconciler implements OnApplicationBootstrap {
  private readonly logger = new Logger(LabelIngestionReconciler.name);

  constructor(
    private readonly labelDocumentRepository: LabelDocumentRepository,
    private readonly labelProcessingService: LabelProcessingService,
    @InjectQueue(LABEL_INGESTION_QUEUE)
    private readonly queue: Queue<LabelIngestionJobData>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.reconcile();
    } catch (error) {
      this.logger.error(
        `Label ingestion reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async reconcile(): Promise<void> {
    const profile = this.labelProcessingService.getEmbeddingProfile();
    const [pendingFetches, pendingEmbeddings] = await Promise.all([
      this.labelDocumentRepository.findMedicationsNeedingIngestion(),
      this.labelDocumentRepository.findDocumentsNeedingEmbedding(
        profile.model,
        profile.version,
      ),
    ]);

    // allSettled, not all/a plain loop — this hook must never throw. A
    // NestJS lifecycle hook that rejects aborts the whole app's startup,
    // which would turn a best-effort safety net into a single point of
    // failure — and the likeliest time for one queue.add() to fail
    // (Redis instability) is exactly when this reconciliation matters most.
    const results = await Promise.allSettled([
      ...pendingFetches.map(({ medicationId, dailyMedId }) => {
        const dailyMedSetId = stripDailyMedPrefix(dailyMedId);
        return this.queue.add(
          FETCH_LABEL_JOB,
          { medicationId, dailyMedSetId },
          { jobId: `${FETCH_LABEL_JOB}-${dailyMedSetId}` },
        );
      }),
      ...pendingEmbeddings.map(({ medicationId, setId, labelVersion }) =>
        this.queue.add(
          PROCESS_LABEL_JOB,
          {
            medicationId,
            setId,
            labelVersion,
            embeddingProfile: profile,
          },
          {
            jobId: processLabelJobId(setId, labelVersion, profile),
          },
        ),
      ),
    ]);

    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    for (const failure of failures) {
      this.logger.error(
        `Failed to enqueue a reconciled label ingestion job: ${failure.reason instanceof Error ? failure.reason.message : String(failure.reason)}`,
      );
    }

    this.logger.log(
      `Reconciled ${results.length - failures.length}/${results.length} label ingestion/embedding job(s) for ${profile.model}@${profile.version}`,
    );
  }
}
