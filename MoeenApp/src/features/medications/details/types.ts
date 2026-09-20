export type MedicationVerificationStatus =
  | "verified"
  | "unresolved";

export type LegacyMedicationVerificationStatus =
  | "verified"
  | "non-verified";

export type MedicationVerificationSource =
  | "palestine_moh"
  | "dailymed"
  | "rxnorm"
  | "manual";

export type UserMedicationStatus =
  | "active"
  | "paused"
  | "stopped"
  | "archived";

export type CompletionStatus =
  | "ongoing"
  | "completed"
  | "cancelled";

export type MedicationDetails = {
  id: number;
  brandName: string | null;
  genericName: string | null;
  verified: LegacyMedicationVerificationStatus;
  verificationSource: MedicationVerificationSource | null;
  verificationStatus: MedicationVerificationStatus;
  dailyMedId: string | null;
  description: string | null;
  createdAt: string;
};

export type MedicationScheduleTime = {
  id: number;
  userMedicationId: number;
  time: string;
  createdAt: string;
};

export type UserMedicationDetails = {
  id: number;
  medicationId: number;
  frequency: number;
  dosageAmount: string;
  dosageUnit: string;
  dosageForm: string;
  instructions: string | null;
  status: UserMedicationStatus;
  completion: CompletionStatus;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  scheduleTimes: MedicationScheduleTime[];
};

export type MedicationDetailsResponse = {
  medication: MedicationDetails;
  userMedications: UserMedicationDetails[];
};
