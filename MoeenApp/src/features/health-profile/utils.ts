import type { Allergy, AllergySeverity, BloodType, Gender, HealthKnowledgeStatus } from './types';

const SEVERITY_RANK: Record<AllergySeverity, number> = {
  severe: 3,
  moderate: 2,
  mild: 1,
};

export const SEVERITY_LABEL: Record<AllergySeverity, string> = {
  severe: 'Severe',
  moderate: 'Moderate',
  mild: 'Mild',
};

export const SEVERITY_OPTIONS: AllergySeverity[] = ['severe', 'moderate', 'mild'];

export const GENDER_OPTIONS: Gender[] = ['male', 'female'];

export const GENDER_LABEL: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
};

export const BLOOD_TYPE_OPTIONS: BloodType[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// 'unknown' is only a DB default before the user ever saves — not a choice offered in the form.
export const KNOWLEDGE_STATUS_OPTIONS: Exclude<HealthKnowledgeStatus, 'unknown'>[] = [
  'none_known',
  'has_records',
];

export const KNOWLEDGE_STATUS_LABEL: Record<HealthKnowledgeStatus, string> = {
  unknown: 'Not set',
  none_known: 'None known',
  has_records: 'Has records',
};

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Matches the backend's E164_PHONE_PATTERN in save-personal-info.dto.ts.
export const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

export function isFutureDate(iso: string): boolean {
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  return date > today;
}

export function getCriticalAllergy(allergies: Allergy[]): Allergy | null {
  if (allergies.length === 0) return null;
  return [...allergies].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  )[0];
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
