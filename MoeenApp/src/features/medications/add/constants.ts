import type {
  DosageForm,
  DosageUnit,
  DurationValue,
  FrequencyValue,
  Option,
} from "./types";

export const DOSAGE_FORMS: Option<DosageForm>[] = [
  { label: "Tablet", value: "Tablet" },
  { label: "Capsule", value: "Capsule" },
  { label: "Liquid (Syrup)", value: "Liquid (Syrup)" },
  { label: "Injection", value: "Injection" },
  { label: "Patch", value: "Patch" },
  { label: "Cream / Ointment", value: "Cream / Ointment" },
  { label: "Drops", value: "Drops" },
  { label: "Inhaler", value: "Inhaler" },
  { label: "Lozenge", value: "Lozenge" },
  { label: "Other", value: "Other" },
];

export const DOSAGE_UNITS: Option<DosageUnit>[] = [
  { label: "Select unit", value: "" },
  { label: "mg", value: "mg" },
  { label: "g", value: "g" },
  { label: "ml", value: "ml" },
  { label: "mcg", value: "mcg" },
  { label: "IU", value: "IU" },
  { label: "puff", value: "puff" },
  { label: "drop", value: "drop" },
];

export const FREQUENCIES: Option<FrequencyValue>[] = [
  { label: "Once daily", value: "once_daily" },
  { label: "Twice daily", value: "twice_daily" },
  { label: "Three times daily", value: "three_times_daily" },
  { label: "Four times daily", value: "four_times_daily" },
  { label: "Every 8 hours", value: "every_8_hours" },
  { label: "Every 6 hours", value: "every_6_hours" },
  { label: "As needed", value: "as_needed" },
];

export const DURATIONS: Option<DurationValue>[] = [
  { label: "3 days", value: "3_days" },
  { label: "1 week", value: "1_week" },
  { label: "2 weeks", value: "2_weeks" },
  { label: "1 month", value: "1_month" },
  { label: "Custom number of days", value: "custom" },
];

export const DEFAULT_SCHEDULES: Record<FrequencyValue, string[]> = {
  once_daily: ["08:00"],
  twice_daily: ["08:00", "20:00"],
  three_times_daily: ["08:00", "14:00", "20:00"],
  four_times_daily: ["06:00", "12:00", "18:00", "00:00"],
  every_8_hours: ["06:00", "14:00", "22:00"],
  every_6_hours: ["06:00", "12:00", "18:00", "00:00"],
  as_needed: [],
};

export const VALID_DOSAGE_UNITS: DosageUnit[] = [
  "",
  "mg",
  "g",
  "ml",
  "mcg",
  "IU",
  "puff",
  "drop",
];
