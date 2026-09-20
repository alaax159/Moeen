import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

import {
  MedicationVerifiedEvent,
  MedicationVerifiedEventEmitter,
  MedicationVerifiedEventSource,
} from './medication-verified.event';

const MEDICATION_VERIFIED = 'medication.verified';

/**
 * In-process transport. Swapping to a queue-backed transport later only
 * means changing this one class — everything else depends on the two
 * interfaces above, not on this implementation.
 */
@Injectable()
export class MedicationEventsService
  implements MedicationVerifiedEventEmitter, MedicationVerifiedEventSource
{
  private readonly emitter = new EventEmitter();

  emit(event: MedicationVerifiedEvent): void {
    this.emitter.emit(MEDICATION_VERIFIED, event);
  }

  onVerified(listener: (event: MedicationVerifiedEvent) => void): void {
    this.emitter.on(MEDICATION_VERIFIED, listener);
  }
}
