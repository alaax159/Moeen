export class EmergencyMedicalCardPatientDto {
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  gender: 'male' | 'female' | null;
  bloodType: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | null;
}

export class EmergencyMedicalCardAllergyDto {
  name: string;
  reaction: string | null;
  severity: string | null;
}

export class EmergencyMedicalCardChronicConditionDto {
  name: string;
}

export class EmergencyMedicalCardMedicationDto {
  name: string | null;
  normalizedName: string | null;
  dose: number;
  unit: string;
  dosageForm: string;
  frequency: number;
  instructions: string | null;
  times: string[];
}

export class EmergencyMedicalCardEmergencyContactDto {
  name: string | null;
  phone: string;
}

export class EmergencyMedicalCardDto {
  patient: EmergencyMedicalCardPatientDto;
  allergies: EmergencyMedicalCardAllergyDto[];
  chronicConditions: EmergencyMedicalCardChronicConditionDto[];
  medications: EmergencyMedicalCardMedicationDto[];
  emergencyContacts: EmergencyMedicalCardEmergencyContactDto[];
  lastUpdated: string | null;
}
