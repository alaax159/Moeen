export type Option<T> = {
  label: string;
  value: T;
};

export type DosageForm =
  | "Tablet"
  | "Capsule"
  | "Liquid (Syrup)"
  | "Injection"
  | "Patch"
  | "Cream / Ointment"
  | "Drops"
  | "Inhaler"
  | "Lozenge"
  | "Other";

export type DosageUnit =
  "" | "mg" | "g" | "ml" | "mcg" | "IU" | "puff" | "drop";

export type FrequencyValue =
  | "once_daily"
  | "twice_daily"
  | "three_times_daily"
  | "four_times_daily"
  | "every_8_hours"
  | "every_6_hours"
  | "as_needed";

export type MedicationSource =
  | "database"
  | "palestine_moh"
  | "dailymed"
  | "rxnorm"
  | "manual";

export type ApiMedicationSource =
  | "existing_db"
  | "palestine_moh"
  | "dailymed"
  | "rxnorm"
  | "manual";

export type DurationValue =
  "3_days" | "1_week" | "2_weeks" | "1_month" | "custom";

export type CompletionValue = "ongoing" | "completed" | "cancelled";

export type MedicationRefPayload = {
  id?: number;
  medicationCatalogId?: number;
  brandName?: string;
  genericName?: string;
  dailymedId?: string;
  rxcui?: string;
  description?: string;
};
export type UserMedicationPayload = {
  frequency: number;
  dosageAmount: number;
  dosageUnit: Exclude<DosageUnit, "">;
  dosageForm: DosageForm;
  instructions?: string;
  completion: CompletionValue;
  durationOption: DurationValue;
  customDays?: number;
};

export type AddMedicationPayload = {
  source: ApiMedicationSource;
  medication: MedicationRefPayload;
  userMedication: UserMedicationPayload;
  scheduleTimes: string[];
};
