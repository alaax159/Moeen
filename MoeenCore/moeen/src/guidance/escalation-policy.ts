import type { SafetyCheckSeverity, SafetyFindingSeverity } from './contracts';
import { CLINICAL_SEVERITY_ORDER } from './contracts';

/**
 * The resolved-safety severity at or above which a completed safety check
 * escalates the patient to the serious-reaction screen.
 *
 * `null` means no escalation ever fires. It MUST stay null until the
 * clinical-policy decision on the escalation threshold is signed off by the
 * person who owns that call. Setting a value here changes a patient-facing
 * safety behaviour — do not change it without that sign-off.
 *
 * See <ticket link — TBD>.
 */
export const ESCALATION_THRESHOLD: SafetyFindingSeverity | null = null;

const clinicalRank = (severity: string): number =>
  (CLINICAL_SEVERITY_ORDER as readonly string[]).indexOf(severity);

/**
 * Pure and fully testable. Fails safe: returns false when `threshold` is null,
 * and for any non-clinical severity ('clear' / 'unverified') — those rank -1 and
 * so can never meet a real threshold.
 */
export function severityMeetsThreshold(
  severity: SafetyCheckSeverity,
  threshold: SafetyFindingSeverity | null,
): boolean {
  if (threshold === null) {
    return false;
  }

  return clinicalRank(severity) >= clinicalRank(threshold);
}

/**
 * The live gate. Called by PipelineOrchestrator.run() after the safety severity
 * resolves; when it returns true the orchestrator attaches escalation info to
 * the GuidanceResponse. It cannot return true today because ESCALATION_THRESHOLD
 * is null — the wiring is real, the gate is closed until that constant is set
 * with clinical sign-off.
 */
export function meetsEscalationThreshold(
  severity: SafetyCheckSeverity,
): boolean {
  return severityMeetsThreshold(severity, ESCALATION_THRESHOLD);
}
