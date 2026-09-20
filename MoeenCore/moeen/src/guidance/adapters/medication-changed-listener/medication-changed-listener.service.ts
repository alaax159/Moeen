import { Injectable } from '@nestjs/common';
import { MedicationChangeEvent, MedicationChangeEventSource, GuidanceRunTrigger } from './medication-changed-listener.port';

@Injectable()
export class MedicationChangedListener {
  constructor(
    private readonly eventSource: MedicationChangeEventSource,
    private readonly guidanceRunTrigger: GuidanceRunTrigger,
  ) {}

  listen(): void {
    this.eventSource.onChange((event) => {
      void this.guidanceRunTrigger.triggerGuidanceRun(event);
    });
  }
}
