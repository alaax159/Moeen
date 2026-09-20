import { getUserMedications } from "@/features/medications/list/api";
import type { UserMedicationSummary } from "@/features/medications/list/types";
import { getWeeklyDoses } from "@/features/schedule/api";
import type { WeeklyDosesResponse } from "@/features/schedule/types";

export interface MedicationReportSourceData {
  medications: UserMedicationSummary[];
  weeklyDoses: WeeklyDosesResponse;
}

export async function getMedicationReportSourceData(
  signal?: AbortSignal,
): Promise<MedicationReportSourceData> {
  const [activeMedications, archivedMedications, weeklyDoses] =
    await Promise.all([
      getUserMedications("active", signal),
      getUserMedications("archived", signal),
      getWeeklyDoses(signal),
    ]);

  return {
    medications: [...activeMedications, ...archivedMedications],
    weeklyDoses,
  };
}
