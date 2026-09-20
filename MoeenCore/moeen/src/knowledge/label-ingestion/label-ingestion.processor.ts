import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';

import {
  FETCH_LABEL_JOB,
  FetchLabelJobData,
  LABEL_INGESTION_QUEUE,
  LabelIngestionJobData,
  PROCESS_LABEL_JOB,
  ProcessLabelJobData,
  processLabelJobId,
} from './label-ingestion-queue.constants';
import { DailyMedClient } from './dailymed-client';
import { LabelDocumentRepository } from './label-document.repository';
import { LabelProcessingService } from '../label-processing/label-processing.service';

@Processor(LABEL_INGESTION_QUEUE)
export class LabelIngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(LabelIngestionProcessor.name);

  constructor(
    private readonly dailyMedClient: DailyMedClient,
    private readonly labelDocumentRepository: LabelDocumentRepository,
    private readonly labelProcessingService: LabelProcessingService,
    @InjectQueue(LABEL_INGESTION_QUEUE)
    private readonly queue: Queue<LabelIngestionJobData>,
  ) {
    super();
  }

  async process(job: Job<LabelIngestionJobData>): Promise<void> {
    switch (job.name) {
      case FETCH_LABEL_JOB:
        return this.handleFetchLabel(job as Job<FetchLabelJobData>);
      case PROCESS_LABEL_JOB:
        return this.handleProcessLabel(job as Job<ProcessLabelJobData>);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleFetchLabel(job: Job<FetchLabelJobData>): Promise<void> {
    const { medicationId, dailyMedSetId } = job.data;

    let labelVersion: string;
    try {
      const metadata = await this.dailyMedClient.fetchMetadata(dailyMedSetId);
      labelVersion = metadata.labelVersion;
    } catch (error) {
      // labelVersion truly unknown at this point — 'unknown' is a sentinel,
      // not a real DailyMed version, so the failure is still visible on
      // label_document rather than only in queue logs.
      await this.recordFailure(
        medicationId,
        dailyMedSetId,
        'unknown',
        error,
        job.attemptsMade,
      );
      throw error;
    }

    try {
      const rawContent =
        await this.dailyMedClient.fetchRawContent(dailyMedSetId);
      const { contentChanged, invalidatedUserIds } =
        await this.labelDocumentRepository.recordFetched({
          medicationId,
          setId: dailyMedSetId,
          labelVersion,
          rawContent,
        });

      if (contentChanged && invalidatedUserIds.length > 0) {
        this.logger.log(
          `Label ${dailyMedSetId}@${labelVersion} changed; queued a safety ` +
            `recheck for ${invalidatedUserIds.length} patient(s) on ` +
            `medication ${medicationId}`,
        );
      }
    } catch (error) {
      await this.recordFailure(
        medicationId,
        dailyMedSetId,
        labelVersion,
        error,
        job.attemptsMade,
      );
      throw error;
    }

    // Split into its own job (see PROCESS_LABEL_JOB's doc comment) rather
    // than continuing inline — a splitter bug shouldn't cost another
    // DailyMed API call on retry.
    await this.queue.add(
      PROCESS_LABEL_JOB,
      {
        medicationId,
        setId: dailyMedSetId,
        labelVersion,
        embeddingProfile: this.labelProcessingService.getEmbeddingProfile(),
      },
      {
        jobId: processLabelJobId(
          dailyMedSetId,
          labelVersion,
          this.labelProcessingService.getEmbeddingProfile(),
        ),
      },
    );
  }

  private async handleProcessLabel(
    job: Job<ProcessLabelJobData>,
  ): Promise<void> {
    const { medicationId, setId, labelVersion, embeddingProfile } = job.data;
    const activeProfile = this.labelProcessingService.getEmbeddingProfile();

    if (
      embeddingProfile &&
      (embeddingProfile.model !== activeProfile.model ||
        embeddingProfile.version !== activeProfile.version ||
        embeddingProfile.dimensions !== activeProfile.dimensions)
    ) {
      throw new Error(
        `Process-label job requires ${embeddingProfile.model}@${embeddingProfile.version}/${embeddingProfile.dimensions}, but this worker provides ${activeProfile.model}@${activeProfile.version}/${activeProfile.dimensions}`,
      );
    }

    const rawContent = await this.labelDocumentRepository.findRawContent(
      setId,
      labelVersion,
    );

    if (!rawContent) {
      // Nothing to retry into existence — the fetch that was supposed to
      // produce this row either hasn't landed yet or failed. Not this
      // job's problem to solve; fail loudly rather than looping forever.
      throw new Error(
        `No rawContent found for setid=${setId} version=${labelVersion}`,
      );
    }

    await this.labelProcessingService.processLabel({
      medicationId,
      setId,
      labelVersion,
      rawContent,
    });
  }

  private async recordFailure(
    medicationId: number,
    setId: string,
    labelVersion: string,
    error: unknown,
    retryCount: number,
  ): Promise<void> {
    await this.labelDocumentRepository.recordFailed({
      medicationId,
      setId,
      labelVersion,
      failureReason: error instanceof Error ? error.message : String(error),
      retryCount,
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<LabelIngestionJobData>, error: Error): void {
    this.logger.error(
      `${job.name} failed for job ${job.id} (attempt ${job.attemptsMade}): ${error.message}`,
      error.stack,
    );
  }
}
