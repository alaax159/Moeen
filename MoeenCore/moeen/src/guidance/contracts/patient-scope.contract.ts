import type {
  SafetyCoverage,
  SafetyCheckSeverity,
  SafetyFinding,
} from './safety-check-result.contract';

export interface PatientScopeMedication {
  /** Active ingredient (generic) name — never the branded product name. */
  ingredientName: string;
  /** Doses per day. */
  frequency: number;
  /** Time-of-day slots only (e.g. "08:00"), never a specific dose's date or scheduledFor timestamp. */
  scheduleSlots: string[];
}

export interface PatientScopeCondition {
  /** Standard terminology code (e.g. SNOMED/RxNorm) when we have one, else null. */
  code: string | null;
  name: string;
}

/**
 * The minimized record the generative side is allowed to see. Built as an
 * explicit allow-list, not a full patient record with fields stripped —
 * that inversion would mean a new patient-table column leaks into this
 * type by default instead of requiring an opt-in.
 *
 * May contain ONLY: ingredient names, condition/allergy codes, schedule
 * shape, the resolved safety severity, the finding set, and the subject
 * medication. Must contain NONE of:
 * name, contact info, date of birth, free-text notes, or any patient id —
 * including on this type itself, which is why there is no patientId field
 * here.
 */
export interface PatientScope {
  medications: PatientScopeMedication[];
  conditions: PatientScopeCondition[];
  allergies: PatientScopeCondition[];
  /** Pre-resolved by the safety engine; downstream code must not recompute it. */
  safetyRunId: string;
  safetyCoverage: SafetyCoverage;
  safetySeverity: SafetyCheckSeverity;
  findings: SafetyFinding[];
  subjectMedicationId?: number;
}
