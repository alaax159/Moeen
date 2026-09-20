import type {
  MedicationSafetyCheckerStatus,
  MedicationSafetyCoverageStatus,
} from '../medication-safety.contracts';

export function isCompleteCheckerStatus(
  status: MedicationSafetyCheckerStatus,
): boolean {
  return status === 'verified' || status === 'not_applicable';
}

export function checkerMayAddFindings(
  status: MedicationSafetyCheckerStatus,
): boolean {
  return status === 'verified' || status === 'partial';
}

export function checkerReplacesFindings(
  status: MedicationSafetyCheckerStatus,
): boolean {
  return isCompleteCheckerStatus(status);
}

export function resolveCoverageStatus(
  statuses: MedicationSafetyCheckerStatus[],
): MedicationSafetyCoverageStatus {
  if (statuses.every(isCompleteCheckerStatus)) return 'complete';
  if (statuses.every((status) => status === 'failed')) return 'failed';
  return 'partial';
}
