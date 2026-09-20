import type { BloodType, Gender } from "@/features/health-profile/types";

export interface EmergencyCardPatient {
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  bloodType: BloodType | null;
}

export interface EmergencyCardAllergy {
  name: string;
  reaction: string | null;
  severity: string | null;
}

export interface EmergencyCardMedication {
  name: string | null;
  normalizedName: string | null;
  dose: number;
  unit: string;
  dosageForm: string;
  frequency: number;
  instructions: string | null;
  times: string[];
}

export interface EmergencyContact {
  name: string | null;
  phone: string;
}

export interface EmergencyMedicalCard {
  patient: EmergencyCardPatient;
  allergies: EmergencyCardAllergy[];
  chronicConditions: { name: string }[];
  medications: EmergencyCardMedication[];
  emergencyContacts: EmergencyContact[];
  lastUpdated: string | null;
}

export interface EmergencyAccessStatus {
  enabled: boolean;
  configured: boolean;
  version: number;
  updatedAt: string | null;
}

export interface EmergencyAccessEnableResult {
  enabled: boolean;
  tokenGenerated: boolean;
  token?: string;
  version: number;
  updatedAt: string;
}

export interface EmergencyAccessTokenResult {
  enabled: true;
  token: string;
  version: number;
  updatedAt: string;
}
