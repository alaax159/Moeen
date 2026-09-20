export type DoseStatus =
  | 'upcoming'
  | 'missed'
  | 'taken'
  | 'skipped';

export interface TodayDose {
  scheduleTimeId: number;
  userMedicationId: number;

  // Nullable in the DB (medication.brand_name / generic_name are `text()` with
  // no NOT NULL) — a medication can carry only one of the two. Resolve a
  // display name via doseMedicationName() in ./utils.
  brandName: string | null;
  genericName: string | null;

  dosageAmount: string;
  dosageUnit: string;
  dosageForm: string;

  instructions: string | null;

  time: string;
  status: DoseStatus;
  snoozeCount: number;
}

export interface WeeklyDoseDay {
  date: string;
  scheduled: number;
  taken: number;
  missed: number;
  skipped: number;
}

export interface WeeklyDosesResponse {
  startDate: string;
  endDate: string;
  days: WeeklyDoseDay[];
}