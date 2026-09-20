import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  CURRENT_MEDICATION_RECHECK_JOB,
  CURRENT_MEDICATION_RECHECK_QUEUE,
  CurrentMedicationRecheckJobData,
} from './current-medication-recheck-queue.constants';

@Injectable()
export class CurrentMedicationRecheckQueue {
  private readonly logger = new Logger(CurrentMedicationRecheckQueue.name);

  constructor(
    @InjectQueue(CURRENT_MEDICATION_RECHECK_QUEUE)
    private readonly queue: Queue<CurrentMedicationRecheckJobData>,
  ) {}

  async enqueue(userId: number): Promise<void> {
    try {
      await this.queue.add(CURRENT_MEDICATION_RECHECK_JOB, { userId });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue medication safety recheck for userId=${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
