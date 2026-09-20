import type { MedicationSafetyDraft } from './medication-safety.contracts';

export const MEDICATION_SAFETY_TRIGGER_EVENT = 'medication-safety.trigger';

export enum MedicationSafetyTriggerType {
  ADD = 'ADD',
  EDIT = 'EDIT',
  MISSED = 'MISSED',
  // Run before the medication is saved, using a draft identity instead of
  // a persisted user_medication row.
  PRECHECK = 'PRECHECK',
}

export interface MedicationSafetyTriggerEvent {
  // Required for ADD/EDIT/MISSED, absent for PRECHECK.
  userMedicationId?: number;
  trigger: MedicationSafetyTriggerType;
  // Required for PRECHECK.
  draft?: MedicationSafetyDraft;
  /** Stable caller key used to deduplicate persisted retries. */
  idempotencyKey?: string;
}
