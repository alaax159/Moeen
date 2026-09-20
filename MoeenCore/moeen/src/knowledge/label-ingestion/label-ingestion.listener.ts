import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import { MedicationEventsService } from '../../medication-events/medication-events.service';
import {
  FETCH_LABEL_JOB,
  FetchLabelJobData,
  LABEL_INGESTION_QUEUE,
} from './label-ingestion-queue.constants';

/**
 * Enqueues and returns immediately — this runs on MedicationVerifiedEvent,
 * which fires from inside AddMedicationService's request handler (after its
 * DB transaction commits). Ingestion itself must never block that request.
 */
@Injectable()
export class LabelIngestionListener implements OnModuleInit {
  private readonly logger = new Logger(LabelIngestionListener.name);

  constructor(
    private readonly medicationEvents: MedicationEventsService,
    @InjectQueue(LABEL_INGESTION_QUEUE)
    private readonly queue: Queue<FetchLabelJobData>,
  ) {}

  onModuleInit(): void {
    this.medicationEvents.onVerified((event) => {
      this.enqueue(event.medicationId, event.dailyMedSetId).catch(
        (error: unknown) => {
          // Logged, not swallowed as an unhandled rejection — the
          // reconciler covers the data gap on next boot, but a failure
          // here should still be visible immediately, not just eventually.
          this.logger.error(
            `Failed to enqueue label ingestion for medicationId=${event.medicationId} setid=${event.dailyMedSetId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        },
      );
    });
  }

  private async enqueue(
    medicationId: number,
    dailyMedSetId: string,
  ): Promise<void> {
    await this.queue.add(
      FETCH_LABEL_JOB,
      { medicationId, dailyMedSetId },
      // BullMQ rejects ':' in custom job ids — verified against a live
      // worker, not just inferred. Unique per setid within this queue is
      // all that's needed, no job-name prefix required.
      { jobId: `${FETCH_LABEL_JOB}-${dailyMedSetId}` },
    );

    this.logger.log(
      `Enqueued label ingestion for medicationId=${medicationId} setid=${dailyMedSetId}`,
    );
  }
}
