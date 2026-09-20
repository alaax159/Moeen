export type MedicationStatus = 'active' | 'archived';

// Mirrors MoeenCore's MedicationSafetyWarning, plus the two fields
// (`affected`, `userMedicationId`) agreed for tasks 1130/1122 but not
// live on the backend yet — this app builds against the agreed shape,
// wiring the real call in once `active-interactions` merges to main.
export type MedicationSafetyWarningType =
  | 'drug_drug'
  | 'drug_allergy'
  | 'drug_condition';

export interface MedicationSafetyWarning {
  warningType: MedicationSafetyWarningType;
  severity: string;
  message: string;
  affected?: string;
  userMedicationId?: number;
}

export interface UserMedicationSummary {
  id: number;
  medicationId: number;
  frequency: number;
  dosageAmount: string;
  dosageUnit: string;
  dosageForm: string;
  instructions: string | null;
  status: MedicationStatus;
  completion: string;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  brandName: string;
  genericName: string;
}

export type TodayScheduleStatus = 'upcoming' | 'missed' | 'taken' | 'skipped';

export interface TodayScheduleEntry {
  scheduleTimeId: number;
  time: string;
  status: TodayScheduleStatus;
}

export interface TodayMedicationSummary {
  taken: number;
  upcoming: number;
  missed: number;
  skipped: number;
}

export interface TodayMedication {
  id: number;
  brandName: string;
  genericName: string;
  dosageAmount: string;
  dosageUnit: string;
  dosageForm: string;
  instructions: string | null;
  frequency: number;
  todaySchedule: TodayScheduleEntry[];
  summary: TodayMedicationSummary;
}