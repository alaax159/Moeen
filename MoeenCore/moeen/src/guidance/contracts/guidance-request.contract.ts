export type GuidanceIntent =
  'missed_dose' | 'explain_finding' | 'medication_question';

export interface GuidanceRequest {
  patientId: number;
  intent: GuidanceIntent;
  /**
   * Exact immutable safety run for this event. `null` means the attempted
   * check was unavailable; `undefined` permits a current-latest lookup.
   */
  safetyRunId?: string | null;
  /** missed_dose, medication_question — which medication this run is about. */
  subjectMedicationId?: number;
  /** Required for explain_finding; invalid for other intents. Immutable medication_safety_finding UUID. */
  subjectSafetyCheckId?: string;
  /** medication_question (patient chat) — the patient's free-text question. */
  question?: string;
}
