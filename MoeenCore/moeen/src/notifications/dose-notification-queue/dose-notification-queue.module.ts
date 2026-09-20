import { BullModule } from '@nestjs/bullmq';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { GuidanceMessageWriter } from '../../guidance/doses/guidance-message-writer.service';
import { MissedDoseGuidanceTrigger } from '../../guidance/doses/missed-dose-guidance-trigger.service';
import { OrchestratorModule } from '../../guidance/orchestrator/orchestrator.module';
import { MedicationSafetyModule } from '../../medication-safety/medication-safety.module';
import { PushSenderAdapterModule } from '../adapters/push-sender-adapter/push-sender-adapter.module';
import { DOSE_NOTIFICATIONS_QUEUE } from './dose-notification-queue.constants';
import { DoseNotificationProcessor } from './dose-notification.processor';
import { DoseScheduleService } from './dose-schedule.service';
import { DoseNotificationBootstrap } from './dose-notification.bootstrap';

@Module({
  imports: [
    MedicationSafetyModule,
    BullModule.registerQueue({
      name: DOSE_NOTIFICATIONS_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    }),
    BullBoardModule.forFeature({
      name: DOSE_NOTIFICATIONS_QUEUE,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: true,
        description: 'Medication dose reminders and missed-dose checks',
      },
    }),
    DatabaseModule,
    OrchestratorModule,
    PushSenderAdapterModule,
  ],
  providers: [
    DoseScheduleService,
    DoseNotificationProcessor,
    DoseNotificationBootstrap,
    MissedDoseGuidanceTrigger,
    GuidanceMessageWriter,
  ],
  exports: [DoseScheduleService],
})
export class DoseNotificationQueueModule {}
