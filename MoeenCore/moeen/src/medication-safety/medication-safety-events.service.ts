import { Injectable, Logger } from '@nestjs/common';

import type { MedicationSafetyResult } from './medication-safety.contracts';
import { MedicationSafetyTriggerEvent } from './medication-safety.events';

type MedicationSafetyTriggerListener = (
  event: MedicationSafetyTriggerEvent,
) => void | MedicationSafetyResult | Promise<void | MedicationSafetyResult>;

@Injectable()
export class MedicationSafetyEventsService {
  private readonly listeners = new Set<MedicationSafetyTriggerListener>();
  private readonly logger = new Logger(MedicationSafetyEventsService.name);

  emitTrigger(event: MedicationSafetyTriggerEvent): void {
    for (const listener of this.listeners) {
      try {
        void Promise.resolve(listener(event)).catch((error: unknown) => {
          this.logListenerError(error);
        });
      } catch (error) {
        this.logListenerError(error);
      }
    }
  }

  async emitTriggerAndWait(
    event: MedicationSafetyTriggerEvent,
  ): Promise<MedicationSafetyResult | undefined> {
    if (this.listeners.size === 0) {
      throw new Error('No medication safety trigger listener is registered');
    }

    const results = await Promise.all(
      [...this.listeners].map(async (listener) => {
        return listener(event);
      }),
    );

    return results.find(
      (result): result is MedicationSafetyResult => result !== undefined,
    );
  }

  onTrigger(listener: MedicationSafetyTriggerListener): void {
    this.listeners.add(listener);
  }

  private logListenerError(error: unknown): void {
    if (error instanceof Error) {
      this.logger.error(
        'Medication safety trigger listener failed',
        error.stack,
      );
      return;
    }

    this.logger.error(
      `Medication safety trigger listener failed: ${String(error)}`,
    );
  }
}
