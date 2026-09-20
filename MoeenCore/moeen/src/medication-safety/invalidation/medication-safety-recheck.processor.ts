import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { MedicationSafetyRouterService } from '../medication-safety-router.service';
import {
  MedicationSafetyRecheckOutboxRepository,
  SafetyRecheckOutboxRow,
} from './medication-safety-recheck-outbox.repository';
import type { SafetyInvalidationTrigger } from './safety-invalidation.writer';

const MAX_ATTEMPTS = 8;
const RECHECK_TRIGGERS: readonly SafetyInvalidationTrigger[] = [
  'medication_added',
  'medication_updated',
  'medication_archived',
  'allergy_updated',
  'condition_updated',
  'knowledge_updated',
  'label_updated',
  'manual_recheck',
];

@Injectable()
export class MedicationSafetyRecheckProcessor {
  private readonly logger = new Logger(MedicationSafetyRecheckProcessor.name);
  private running = false;

  constructor(
    private readonly outbox: MedicationSafetyRecheckOutboxRepository,
    private readonly router: MedicationSafetyRouterService,
  ) {}

  @Interval(5000)
  async processBatch(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const rows = await this.outbox.claimBatch();
      for (const row of rows) await this.processRow(row);
    } catch (error) {
      this.logger.error(
        'Medication safety recheck outbox polling failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private async processRow(row: SafetyRecheckOutboxRow): Promise<void> {
    if (!RECHECK_TRIGGERS.includes(row.trigger as SafetyInvalidationTrigger)) {
      await this.outbox.recordFailure(
        row.id,
        MAX_ATTEMPTS,
        `Unsupported safety invalidation trigger: ${row.trigger}`,
        MAX_ATTEMPTS,
      );
      return;
    }

    if (row.subjectUserMedicationId === null) {
      await this.outbox.recordFailure(
        row.id,
        MAX_ATTEMPTS,
        'The queued subject medication no longer exists',
        MAX_ATTEMPTS,
      );
      return;
    }

    try {
      await this.router.route({
        type: row.trigger as SafetyInvalidationTrigger,
        userMedicationId: row.subjectUserMedicationId,
        idempotencyKey: `outbox:${row.id}`,
      });
      await this.outbox.markCompleted(row.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown safety recheck error';
      await this.outbox.recordFailure(
        row.id,
        row.attempts,
        message,
        MAX_ATTEMPTS,
      );
    }
  }
}
