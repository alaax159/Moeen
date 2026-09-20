import { Platform } from 'react-native';

import { authenticatedFetch } from '@/api/authenticated-fetch';

import type {
  Allergy,
  AllergyInput,
  AllergySeverity,
  ChronicCondition,
  ChronicConditionInput,
  HealthProfile,
  MedicalTerm,
  PersonalInfo,
} from './types';

/**
 * All calls below hit the real backend (targets MoeenCore PR 321 + 326 +
 * 354's concept-based allergy/condition model — unmerged as of this
 * writing). There's no allergy/condition update endpoint, by design: editing
 * isn't supported, delete-and-re-add covers the rare case of changing one.
 */

const DEFAULT_API_BASE_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://localhost:3000';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ??
  DEFAULT_API_BASE_URL;

interface AllergyResponse {
  id: number;
  name: string;
  externalId?: string | null;
  reaction: string | null;
  severity: string | null;
  isActive: boolean;
}

interface ChronicConditionResponse {
  id: number;
  name: string;
  externalId?: string | null;
  diagnosisDate: string | null;
  notes: string | null;
  isActive: boolean;
}

interface PersonalInfoResponse {
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  weightKg: string | number | null;
  heightCm: string | number | null;
  gender: PersonalInfo['gender'] | null;
  bloodType: PersonalInfo['bloodType'] | null;
  allergyKnowledgeStatus: PersonalInfo['allergyKnowledgeStatus'] | null;
  conditionKnowledgeStatus: PersonalInfo['conditionKnowledgeStatus'] | null;
  emergencyContactPhone?: string | null;
  doctorName?: string | null;
  doctorPhone?: string | null;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('message' in data)
  ) {
    return fallback;
  }

  const message = data.message;

  return Array.isArray(message)
    ? message.join('\n')
    : String(message);
}

function mapPersonalInfo(data: PersonalInfoResponse): PersonalInfo {
  if (
    !data.firstName ||
    !data.lastName ||
    !data.dateOfBirth ||
    data.weightKg == null ||
    data.heightCm == null ||
    !data.gender ||
    !data.bloodType ||
    !data.allergyKnowledgeStatus ||
    !data.conditionKnowledgeStatus
  ) {
    throw new HealthProfileApiError(
      'Personal information is incomplete.',
    );
  }

  return {
    firstName: data.firstName,
    lastName: data.lastName,
    dateOfBirth: data.dateOfBirth,
    weightKg: Number(data.weightKg),
    heightCm: Number(data.heightCm),
    gender: data.gender,
    bloodType: data.bloodType,
    allergyKnowledgeStatus: data.allergyKnowledgeStatus,
    conditionKnowledgeStatus: data.conditionKnowledgeStatus,
    emergencyContactPhone: data.emergencyContactPhone ?? undefined,
    doctorName: data.doctorName ?? undefined,
    doctorPhone: data.doctorPhone ?? undefined,
  };
}

function mapAllergy(data: AllergyResponse): Allergy {
  return {
    id: data.id,
    name: data.name,
    externalId: data.externalId ?? undefined,
    severity: (data.severity as AllergySeverity | null) ?? 'moderate',
    reaction: data.reaction ?? '',
    isActive: data.isActive,
  };
}

function mapChronicCondition(data: ChronicConditionResponse): ChronicCondition {
  return {
    id: data.id,
    name: data.name,
    externalId: data.externalId ?? undefined,
    diagnosisDate: data.diagnosisDate ?? '',
    notes: data.notes ?? undefined,
    isActive: data.isActive,
  };
}

export class HealthProfileApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HealthProfileApiError';
  }
}

async function searchMedicalTerms(
  endpoint: 'allergies' | 'chronic-conditions',
  query: string,
): Promise<MedicalTerm[]> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/health-profile/${endpoint}?search=${encodeURIComponent(query)}`,
  );

  if (!response.ok) {
    throw new HealthProfileApiError(`Unable to search (${response.status}).`);
  }

  return response.json();
}

export function searchAllergyTerms(query: string): Promise<MedicalTerm[]> {
  return searchMedicalTerms('allergies', query);
}

export function searchChronicConditionTerms(query: string): Promise<MedicalTerm[]> {
  return searchMedicalTerms('chronic-conditions', query);
}

export async function createHealthProfile(): Promise<void> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/health-profile`,
    {
      method: 'POST',
    },
  );

  const responseData = await parseResponse(response);

  // 409 means the profile already exists, which is safe to continue with.
  if (!response.ok && response.status !== 409) {
    throw new HealthProfileApiError(
      getErrorMessage(
        responseData,
        `Unable to create health profile (${response.status}).`,
      ),
    );
  }
}

export async function getUserAllergies(): Promise<Allergy[]> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/health-profile/allergies/user`,
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new HealthProfileApiError(
      getErrorMessage(
        responseData,
        `Unable to load allergies (${response.status}).`,
      ),
    );
  }

  return (responseData as AllergyResponse[]).map(mapAllergy);
}

export async function getUserChronicConditions(): Promise<ChronicCondition[]> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/health-profile/chronic-conditions/user`,
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new HealthProfileApiError(
      getErrorMessage(
        responseData,
        `Unable to load chronic conditions (${response.status}).`,
      ),
    );
  }

  return (responseData as ChronicConditionResponse[]).map(mapChronicCondition);
}

export async function getHealthProfile(): Promise<HealthProfile> {
  const [response, allergies, chronicConditions] = await Promise.all([
    authenticatedFetch(`${API_BASE_URL}/api/health-profile`),
    getUserAllergies(),
    getUserChronicConditions(),
  ]);

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new HealthProfileApiError(
      getErrorMessage(
        responseData,
        `Unable to load health profile (${response.status}).`,
      ),
    );
  }

  const personalInfo = mapPersonalInfo(
    responseData as PersonalInfoResponse,
  );

  return { personalInfo, allergies, chronicConditions };
}

export async function updatePersonalInfo(
  input: PersonalInfo,
): Promise<PersonalInfo> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/health-profile/personal-info`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new HealthProfileApiError(
      getErrorMessage(
        responseData,
        `Unable to update personal information (${response.status}).`,
      ),
    );
  }

  return mapPersonalInfo(
    responseData as PersonalInfoResponse,
  );
}

export async function addAllergy(input: AllergyInput): Promise<Allergy> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/health-profile/allergies`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new HealthProfileApiError(
      getErrorMessage(
        responseData,
        `Unable to add allergy (${response.status}).`,
      ),
    );
  }

  return mapAllergy(responseData as AllergyResponse);
}

export async function deleteAllergy(id: number): Promise<void> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/health-profile/allergies/${id}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    const responseData = await parseResponse(response);
    throw new HealthProfileApiError(
      getErrorMessage(
        responseData,
        `Unable to delete allergy (${response.status}).`,
      ),
    );
  }
}

export async function addChronicCondition(input: ChronicConditionInput): Promise<ChronicCondition> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/health-profile/chronic-conditions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new HealthProfileApiError(
      getErrorMessage(
        responseData,
        `Unable to add chronic condition (${response.status}).`,
      ),
    );
  }

  return mapChronicCondition(responseData as ChronicConditionResponse);
}

export async function deleteChronicCondition(id: number): Promise<void> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/health-profile/chronic-conditions/${id}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    const responseData = await parseResponse(response);
    throw new HealthProfileApiError(
      getErrorMessage(
        responseData,
        `Unable to delete chronic condition (${response.status}).`,
      ),
    );
  }
}
