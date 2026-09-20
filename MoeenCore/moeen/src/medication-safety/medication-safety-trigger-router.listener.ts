import { Injectable } from '@nestjs/common';

import { MedicationSafetyEventsService } from './medication-safety-events.service';
import {
  MedicationSafetyTriggerEvent,
  MedicationSafetyTriggerType,
} from './medication-safety.events';
import type {
  MedicationSafetyEventType,
  MedicationSafetyResult,
} from './medication-safety.contracts';
import { MedicationSafetyRouterService } from './medication-safety-router.service';

@Injectable()
export class MedicationSafetyTriggerRouterListener {
  constructor(
    medicationSafetyEventsService: MedicationSafetyEventsService,
    private readonly medicationSafetyRouterService: MedicationSafetyRouterService,
  ) {
    medicationSafetyEventsService.onTrigger((event) =>
      this.handleTrigger(event),
    );
  }

  private async handleTrigger(
    event: MedicationSafetyTriggerEvent,
  ): Promise<MedicationSafetyResult> {
    return this.medicationSafetyRouterService.route({
      type: this.toRouterEventType(event.trigger),
      userMedicationId: event.userMedicationId,
      draft: event.draft,
      ...(event.idempotencyKey ? { idempotencyKey: event.idempotencyKey } : {}),
    });
  }

  private toRouterEventType(
    trigger: MedicationSafetyTriggerType,
  ): MedicationSafetyEventType {
    switch (trigger) {
      case MedicationSafetyTriggerType.ADD:
        return 'medication_added';
      case MedicationSafetyTriggerType.EDIT:
        return 'medication_updated';
      case MedicationSafetyTriggerType.MISSED:
        return 'dose_missed';
      case MedicationSafetyTriggerType.PRECHECK:
        return 'medication_precheck';
    }
  }
}
