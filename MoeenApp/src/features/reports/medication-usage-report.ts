import type { UserMedicationSummary } from "@/features/medications/list/types";
import type { WeeklyDosesResponse } from "@/features/schedule/types";
import {
  isCurrentMedication,
  summarizeMedicationHistory,
  summarizeWeeklyDoses,
} from "./medication-history-summary";

export type MedicationReportStatus = "current" | "past";

export interface MedicationUsageReportMedication {
  userMedicationId: number;
  medicationId: number;
  brandName: string;
  genericName: string;
  dosageAmount: string;
  dosageUnit: string;
  dosageForm: string;
  frequency: number;
  instructions: string | null;
  status: MedicationReportStatus;
  startDate: string;
  endDate: string | null;
}

export interface MedicationUsageReportDay {
  date: string;
  scheduled: number;
  taken: number;
  missed: number;
  skipped: number;
}

export interface MedicationUsageReport {
  generatedAt: string;
  adherencePeriod: {
    startDate: string;
    endDate: string;
  };
  medicationSummary: {
    total: number;
    current: number;
    past: number;
  };
  doseSummary: {
    scheduled: number;
    taken: number;
    missed: number;
    skipped: number;
    adherencePercentage: number | null;
  };
  medications: MedicationUsageReportMedication[];
  days: MedicationUsageReportDay[];
}

function compareMedications(
  left: MedicationUsageReportMedication,
  right: MedicationUsageReportMedication,
): number {
  if (left.status !== right.status) {
    return left.status === "current" ? -1 : 1;
  }

  return right.startDate.localeCompare(left.startDate);
}

export function buildMedicationUsageReport(
  medications: readonly UserMedicationSummary[],
  weeklyDoses: WeeklyDosesResponse,
  generatedAt: string,
): MedicationUsageReport {
  const medicationSummary = summarizeMedicationHistory(medications);
  const doseSummary = summarizeWeeklyDoses(weeklyDoses);

  const reportMedications = medications
    .map<MedicationUsageReportMedication>((medication) => ({
      userMedicationId: medication.id,
      medicationId: medication.medicationId,
      brandName: medication.brandName?.trim() ?? "",
      genericName: medication.genericName?.trim() ?? "",
      dosageAmount: medication.dosageAmount,
      dosageUnit: medication.dosageUnit,
      dosageForm: medication.dosageForm,
      frequency: medication.frequency,
      instructions: medication.instructions,
      status: isCurrentMedication(medication) ? "current" : "past",
      startDate: medication.startDate,
      endDate: medication.endDate,
    }))
    .sort(compareMedications);

  return {
    generatedAt,
    adherencePeriod: {
      startDate: weeklyDoses.startDate,
      endDate: weeklyDoses.endDate,
    },
    medicationSummary,
    doseSummary,
    medications: reportMedications,
    days: weeklyDoses.days.map((day) => ({ ...day })),
  };
}
