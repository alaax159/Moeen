import { SafetyCheckResult } from '../../contracts';

export interface SafetyResultPort {
  getLatestForPatient(patientId: number): Promise<SafetyCheckResult>;
  getLatestForMedication(
    patientId: number,
    subjectMedicationId: number,
  ): Promise<SafetyCheckResult>;
  /** Returns an exact run only while it is still current for this patient. */
  getCurrentRunForPatient(
    patientId: number,
    runId: string,
  ): Promise<SafetyCheckResult>;
  /** Historical immutable run lookup, used for audit/review surfaces. */
  getRunById(runId: string): Promise<SafetyCheckResult | null>;
  /**
   * Patient-facing exact finding lookup. Returns the finding only while its
   * immutable run still matches the patient's current safety context.
   */
  getFindingById(
    findingId: string,
    patientId: number,
  ): Promise<SafetyCheckResult | null>;
  getUnverifiedForPatient(patientId: number): SafetyCheckResult;
}

export const SAFETY_RESULT_PORT = Symbol('SAFETY_RESULT_PORT');
