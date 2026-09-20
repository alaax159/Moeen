/**
 * Fires exactly once per medication (drug), the first time it's verified —
 * not once per patient who adds it. Contrast with guidance's
 * MedicationChangeEvent (per user_medication, fires on every add/edit): that
 * one triggers a safety re-check per patient; this one triggers label
 * ingestion for the shared drug catalog row, which only ever needs to
 * happen once.
 */
export interface MedicationVerifiedEvent {
  medicationId: number;
  /** Raw DailyMed setid — already stripped of the medication.dailyMedId "dm/" prefix. */
  dailyMedSetId: string;
}

export interface MedicationVerifiedEventEmitter {
  emit(event: MedicationVerifiedEvent): void;
}

export interface MedicationVerifiedEventSource {
  onVerified(listener: (event: MedicationVerifiedEvent) => void): void;
}
