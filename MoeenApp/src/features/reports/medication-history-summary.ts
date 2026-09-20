import type { UserMedicationSummary } from "@/features/medications/list/types";
import type { WeeklyDosesResponse } from "@/features/schedule/types";
import { getWeeklyAdherencePercentage } from "@/features/schedule/weekly-adherence";

export interface MedicationHistoryCounts {
  total: number;
  current: number;
  past: number;
}

export interface WeeklyMedicationAdherenceSummary {
  scheduled: number;
  taken: number;
  missed: number;
  skipped: number;
  adherencePercentage: number | null;
}

export function isCurrentMedication(
  medication: UserMedicationSummary,
): boolean {
  return medication.status === "active" && medication.completion === "ongoing";
}

export function summarizeMedicationHistory(
  medications: readonly UserMedicationSummary[],
): MedicationHistoryCounts {
  const current = medications.reduce(
    (count, medication) => count + (isCurrentMedication(medication) ? 1 : 0),
    0,
  );

  return {
    total: medications.length,
    current,
    past: medications.length - current,
  };
}

export function summarizeWeeklyDoses(
  weeklyDoses: WeeklyDosesResponse,
): WeeklyMedicationAdherenceSummary {
  const totals = weeklyDoses.days.reduce(
    (summary, day) => ({
      scheduled: summary.scheduled + day.scheduled,
      taken: summary.taken + day.taken,
      missed: summary.missed + day.missed,
      skipped: summary.skipped + day.skipped,
    }),
    {
      scheduled: 0,
      taken: 0,
      missed: 0,
      skipped: 0,
    },
  );

  return {
    ...totals,
    adherencePercentage: getWeeklyAdherencePercentage(weeklyDoses.days),
  };
}
