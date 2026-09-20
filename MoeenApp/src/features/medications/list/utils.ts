import type { MedicationSafetyWarning, TodayScheduleStatus } from './types';

export function formatFrequency(frequency: number): string {
  switch (frequency) {
    case 0:
      return 'As needed';
    case 1:
      return 'Once daily';
    case 2:
      return 'Twice daily';
    case 3:
      return 'Three times daily';
    case 4:
      return 'Four times daily';
    default:
      return `${frequency}x daily`;
  }
}

const STATUS_PRIORITY: Record<TodayScheduleStatus, number> = {
  missed: 0,
  upcoming: 1,
  taken: 2,
  skipped: 3,
};

export function getWorstStatus(
  statuses: TodayScheduleStatus[],
): TodayScheduleStatus {
  return statuses.reduce((worst, current) =>
    STATUS_PRIORITY[current] < STATUS_PRIORITY[worst] ? current : worst,
  );
}

export function formatTime(time: string): string {
  const [hoursStr, minutesStr] = time.split(':');
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const displayMinutes = minutes.toString().padStart(2, '0');

  return `${displayHours}:${displayMinutes} ${period}`;
}

export const STATUS_ICON: Record<TodayScheduleStatus, string> = {
  taken: '✓',
  upcoming: '⏳',
  missed: '⚠️',
  skipped: '–',
};

// The backend doesn't emit one consistent severity scale yet (flagged
// separately — different checkers use major/moderate/minor,
// high/medium/low, or unknown/none). Duplicated from the same merge this
// app already needs elsewhere; remove once severity is normalized
// server-side and this can just compare an enum.
const SEVERITY_RANK: Record<string, number> = {
  unknown: 0,
  low: 1,
  minor: 1,
  medium: 2,
  moderate: 2,
  high: 3,
  major: 4,
  contraindicated: 5,
};

export function groupWarningsByMedication(
  warnings: MedicationSafetyWarning[],
): Map<number, MedicationSafetyWarning[]> {
  const grouped = new Map<number, MedicationSafetyWarning[]>();

  for (const warning of warnings) {
    if (warning.userMedicationId === undefined) continue;

    const existing = grouped.get(warning.userMedicationId) ?? [];
    existing.push(warning);
    grouped.set(warning.userMedicationId, existing);
  }

  return grouped;
}

export function getMostSevereWarning(
  warnings: MedicationSafetyWarning[],
): MedicationSafetyWarning {
  return warnings.reduce((worst, current) => {
    const worstRank = SEVERITY_RANK[worst.severity.toLowerCase()] ?? 0;
    const currentRank = SEVERITY_RANK[current.severity.toLowerCase()] ?? 0;
    return currentRank > worstRank ? current : worst;
  });
}

export function isSevereWarning(severity: string): boolean {
  const key = severity.toLowerCase();
  return key === 'contraindicated' || key === 'major' || key === 'high';
}

export const WARNING_SEVERITY_LABEL: Record<string, string> = {
  contraindicated: 'Contraindicated',
  major: 'Major',
  high: 'High',
  moderate: 'Moderate',
  medium: 'Medium',
  minor: 'Minor',
  low: 'Low',
  unknown: 'Unverified',
};

export const WARNING_TYPE_LABEL: Record<
  MedicationSafetyWarning['warningType'],
  string
> = {
  drug_drug: 'Drug interaction',
  drug_allergy: 'Allergy conflict',
  drug_condition: 'Condition caution',
};
