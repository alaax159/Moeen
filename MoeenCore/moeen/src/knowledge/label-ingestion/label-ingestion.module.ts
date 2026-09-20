import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { Module } from '@nestjs/common';

import { MedicationEventsModule } from '../../medication-events/medication-events.module';
import { LabelProcessingModule } from '../label-processing/label-processing.module';
import { LABEL_INGESTION_QUEUE } from './label-ingestion-queue.constants';
import { DailyMedClient } from './dailymed-client';
import { LabelDocumentRepository } from './label-document.repository';
import { LabelIngestionProcessor } from './label-ingestion.processor';
import { LabelIngestionListener } from './label-ingestion.listener';
import { LabelIngestionReconciler } from './label-ingestion.reconciler';

@Module({
  imports: [
    HttpModule,
    MedicationEventsModule,
    LabelProcessingModule,
    BullModule.registerQueue({
      name: LABEL_INGESTION_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    }),
    BullBoardModule.forFeature({
      name: LABEL_INGESTION_QUEUE,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: true,
        description: 'DailyMed label fetch + ingestion',
      },
    }),
  ],
  providers: [
    DailyMedClient,
    LabelDocumentRepository,
    LabelIngestionProcessor,
    LabelIngestionListener,
    LabelIngestionReconciler,
  ],
})
export class LabelIngestionModule {}
