export type MedicationChangeTrigger = 'added' | 'edited';

export interface MedicationChangeEvent {
  userMedicationId: number;
  trigger: MedicationChangeTrigger;
}

/**
 * Whatever the real transport turns out to be — the existing in-process
 * EventEmitter on task/1530, or a queue later — only needs to satisfy this
 * one method. This is the whole isolation the task asks for: swap the
 * transport, only the concrete adapter implementing this interface changes.
 */
export interface MedicationChangeEventSource {
  onChange(listener: (event: MedicationChangeEvent) => void): void;
}

/**
 * Stands in for "kick off a guidance run" — BC-2's orchestrator, which
 * doesn't exist in this repo yet. A real implementation swaps in once it does.
 */
export interface GuidanceRunTrigger {
  triggerGuidanceRun(event: MedicationChangeEvent): Promise<void>;
}
