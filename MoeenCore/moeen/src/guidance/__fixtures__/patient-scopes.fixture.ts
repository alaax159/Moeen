import type { PatientScope } from '../contracts';
import { safetyCheckResultFixtures } from './safety-check-results.fixture';

/**
 * Both valid under the Step 2 allow-list: no name, contact info, date of
 * birth, free-text notes, or patient id anywhere on either fixture.
 */
export const patientScopeFixtures = {
  singleMedicationClear: {
    medications: [
      { ingredientName: 'lisinopril', frequency: 1, scheduleSlots: ['08:00'] },
    ],
    conditions: [{ code: '38341003', name: 'Hypertension' }],
    allergies: [],
    safetyRunId: safetyCheckResultFixtures.clear.runId,
    safetyCoverage: safetyCheckResultFixtures.clear.coverage,
    safetySeverity: safetyCheckResultFixtures.clear.severity,
    findings: safetyCheckResultFixtures.clear.findings,
  },

  interactionCase: {
    medications: [
      { ingredientName: 'warfarin', frequency: 1, scheduleSlots: ['20:00'] },
      { ingredientName: 'aspirin', frequency: 1, scheduleSlots: ['08:00'] },
    ],
    conditions: [],
    allergies: [],
    safetyRunId: safetyCheckResultFixtures.moderateInteraction.runId,
    safetyCoverage: safetyCheckResultFixtures.moderateInteraction.coverage,
    safetySeverity: safetyCheckResultFixtures.moderateInteraction.severity,
    findings: safetyCheckResultFixtures.moderateInteraction.findings,
    subjectMedicationId: 101,
  },
} as const satisfies Record<string, PatientScope>;
