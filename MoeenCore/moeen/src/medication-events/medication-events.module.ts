import { Module } from '@nestjs/common';

import { MedicationEventsService } from './medication-events.service';

/**
 * Neutral ground between the medications feature (emits) and knowledge
 * ingestion (listens) — neither owns the other, so the event bus lives in
 * its own module both import. Import this, not the service directly, so
 * both sides always share the one singleton instance.
 */
@Module({
  providers: [MedicationEventsService],
  exports: [MedicationEventsService],
})
export class MedicationEventsModule {}
