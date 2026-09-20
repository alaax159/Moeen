import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { CurrentMedicationRecheckService } from '../current-medication-recheck.service';
import {
  CURRENT_MEDICATION_RECHECK_JOB,
  CURRENT_MEDICATION_RECHECK_QUEUE,
  CurrentMedicationRecheckJobData,
} from './current-medication-recheck-queue.constants';

@Processor(CURRENT_MEDICATION_RECHECK_QUEUE)
export class CurrentMedicationRecheckProcessor extends WorkerHost {
  private readonly logger = new Logger(CurrentMedicationRecheckProcessor.name);

  constructor(
    private readonly currentMedicationRecheckService: CurrentMedicationRecheckService,
  ) {
    super();
  }

  async process(job: Job<CurrentMedicationRecheckJobData>): Promise<void> {
    if (job.name !== CURRENT_MEDICATION_RECHECK_JOB) {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }

    await this.currentMedicationRecheckService.recheckUser(job.data.userId);
  }

  @OnWorkerEvent('failed')
  onFailed(
    job: Job<CurrentMedicationRecheckJobData> | undefined,
    error: Error,
  ): void {
    this.logger.error(
      `Medication safety recheck job ${job?.id ?? 'unknown'} failed after ${
        job?.attemptsMade ?? 0
      } attempt(s): ${error.message}`,
      error.stack,
    );
  }
}
