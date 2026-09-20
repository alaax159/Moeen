import { PatientScope } from '../../contracts';

export interface BuildPatientScopeParams {
  patientId: number;
  /** Exact event run; null explicitly means the safety check was unavailable. */
  safetyRunId?: string | null;
  /** The medication this pipeline run is about, if any — carried straight through onto PatientScope.subjectMedicationId. */
  subjectMedicationId?: number;
  /**
   * explain_finding — mirrors GuidanceRequest.subjectSafetyCheckId, which
   * carries an immutable medication_safety_finding UUID.
   *
   * When present, narrows PatientScope.findings to just this one finding via
   * SafetyResultPort.getFindingById through its current-context fence, instead
   * of every current finding from getLatestForPatient. Without this, a patient
   * with two active findings has
   * no way to tell the pipeline which one an explain_finding run is actually
   * about — see the scope-builder README for the full reasoning.
   */
  subjectSafetyCheckId?: string;
}

export interface PatientScopeBuilderPort {
  buildScope(params: BuildPatientScopeParams): Promise<PatientScope>;
}

export const PATIENT_SCOPE_BUILDER_PORT = Symbol('PATIENT_SCOPE_BUILDER_PORT');
