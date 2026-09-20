export type AllergySeverity = 'severe' | 'moderate' | 'mild';

export interface Allergy {
  id: number;
  name: string;
  externalId?: string;
  severity: AllergySeverity;
  reaction: string;
  isActive: boolean;
}

export interface ChronicCondition {
  id: number;
  name: string;
  externalId?: string;
  diagnosisDate: string;
  notes?: string;
  isActive: boolean;
}

export type BloodType =
  | 'A+' | 'A-'
  | 'B+' | 'B-'
  | 'AB+' | 'AB-'
  | 'O+' | 'O-';

export type Gender = 'male' | 'female';

export type HealthKnowledgeStatus = 'unknown' | 'none_known' | 'has_records';

export interface PersonalInfo {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  weightKg: number;
  heightCm: number;
  gender: Gender;
  bloodType: BloodType;
  allergyKnowledgeStatus: HealthKnowledgeStatus;
  conditionKnowledgeStatus: HealthKnowledgeStatus;
  emergencyContactPhone?: string;
  doctorName?: string;
  doctorPhone?: string;
}

export interface HealthProfile {
  personalInfo: PersonalInfo;
  allergies: Allergy[];
  chronicConditions: ChronicCondition[];
}

export type AllergyInput = Omit<Allergy, 'id' | 'isActive'>;
export type ChronicConditionInput = Omit<ChronicCondition, 'id' | 'isActive'>;

export type CodeSystem = 'local' | 'snomed' | 'rxnorm' | 'umls' | 'icd10cm';

export interface MedicalTerm {
  id: string;
  externalId?: string;
  name: string;
  codeSystem: CodeSystem;
  source: 'existing_db' | 'clinical_tables' | 'umls';
}
