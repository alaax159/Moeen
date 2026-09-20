import type {
    DosageForm,
    DosageUnit,
    DurationValue,
} from "@/features/medications/add/types";

export type UpdateDurationValue =
  | DurationValue
  | "ongoing";

export type UpdateMedicationPayload = {
  frequency: number;
  dosageAmount: number;
  dosageUnit: Exclude<DosageUnit, "">;
  dosageForm: DosageForm;
  instructions: string;
  scheduleTimes: string[];
  durationOption: UpdateDurationValue;
  customDays?: number;
};

export type UpdateMedicationResponse = {
  id: number;
  medicationId: number;
  brandName: string | null;
  genericName: string | null;
  verified: "verified" | "non-verified";
  verificationSource: "palestine_moh" | "dailymed" | "rxnorm" | "manual" | null;
  verificationStatus: "verified" | "unresolved";
  dailyMedId: string | null;
  dosageAmount: string;
  dosageUnit: string;
  dosageForm: string;
  frequency: number;
  instructions: string | null;
  startDate: string;
  endDate: string | null;
  scheduleTimes: string[];
};
