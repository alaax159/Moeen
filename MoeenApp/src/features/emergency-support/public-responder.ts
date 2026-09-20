import type { EmergencyMedicalCard } from "./types";
import {
  isCanonicalEmergencyToken,
  normalizeResponderBaseUrl,
} from "./qr-payload";

export const EMERGENCY_INFORMATION_UNAVAILABLE =
  "Emergency information is unavailable.";
export const EMERGENCY_INFORMATION_RETRY =
  "Emergency information could not be loaded. Check the connection and try again.";
export const EMERGENCY_INFORMATION_CONFIGURATION =
  "Emergency information is unavailable because the responder service is not configured.";

export class PublicEmergencyCardError extends Error {
  constructor(readonly kind: "configuration" | "unavailable" | "retry") {
    super(
      kind === "configuration"
        ? EMERGENCY_INFORMATION_CONFIGURATION
        : kind === "unavailable"
        ? EMERGENCY_INFORMATION_UNAVAILABLE
        : EMERGENCY_INFORMATION_RETRY,
    );
    this.name = "PublicEmergencyCardError";
  }
}

interface FragmentLocation {
  hash: string;
  pathname: string;
  search: string;
}

interface FragmentHistory {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

export function consumeEmergencyTokenFragment(
  location: FragmentLocation,
  history: FragmentHistory,
): string | null {
  let token: string | null = null;

  try {
    token = new URLSearchParams(location.hash.replace(/^#/, "")).get("token");
  } catch {
    token = null;
  }

  try {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  } catch {
    // Some embedded browsers do not permit history replacement.
  }

  return token && isCanonicalEmergencyToken(token) ? token : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isGender(
  value: unknown,
): value is EmergencyMedicalCard["patient"]["gender"] {
  return value === null || value === "male" || value === "female";
}

function isBloodType(
  value: unknown,
): value is EmergencyMedicalCard["patient"]["bloodType"] {
  return (
    value === null ||
    ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].includes(value as string)
  );
}

function parseEmergencyMedicalCard(
  value: unknown,
): EmergencyMedicalCard | null {
  if (
    !isObject(value) ||
    !isObject(value.patient) ||
    !Array.isArray(value.allergies) ||
    !Array.isArray(value.chronicConditions) ||
    !Array.isArray(value.medications) ||
    !Array.isArray(value.emergencyContacts) ||
    !isNullableString(value.lastUpdated)
  ) {
    return null;
  }

  const patient = value.patient;
  if (
    !isNullableString(patient.firstName) ||
    !isNullableString(patient.lastName) ||
    !isNullableString(patient.dateOfBirth) ||
    !isGender(patient.gender) ||
    !isBloodType(patient.bloodType)
  ) {
    return null;
  }

  const allergies = value.allergies;
  const chronicConditions = value.chronicConditions;
  const medications = value.medications;
  const emergencyContacts = value.emergencyContacts;
  if (
    !allergies.every(
      (item) =>
        isObject(item) &&
        typeof item.name === "string" &&
        isNullableString(item.reaction) &&
        isNullableString(item.severity),
    ) ||
    !chronicConditions.every(
      (item) => isObject(item) && typeof item.name === "string",
    ) ||
    !medications.every(
      (item) =>
        isObject(item) &&
        isNullableString(item.name) &&
        isNullableString(item.normalizedName) &&
        typeof item.dose === "number" &&
        Number.isFinite(item.dose) &&
        typeof item.unit === "string" &&
        typeof item.dosageForm === "string" &&
        typeof item.frequency === "number" &&
        Number.isInteger(item.frequency) &&
        item.frequency >= 0 &&
        isNullableString(item.instructions) &&
        Array.isArray(item.times) &&
        item.times.every((time) => typeof time === "string"),
    ) ||
    !emergencyContacts.every(
      (item) =>
        isObject(item) &&
        isNullableString(item.name) &&
        typeof item.phone === "string",
    )
  ) {
    return null;
  }

  return {
    patient: {
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      bloodType: patient.bloodType,
    },
    allergies: allergies.map((item) => ({
      name: item.name as string,
      reaction: item.reaction as string | null,
      severity: item.severity as string | null,
    })),
    chronicConditions: chronicConditions.map((item) => ({
      name: item.name as string,
    })),
    medications: medications.map((item) => ({
      name: item.name as string | null,
      normalizedName: item.normalizedName as string | null,
      dose: item.dose as number,
      unit: item.unit as string,
      dosageForm: item.dosageForm as string,
      frequency: item.frequency as number,
      instructions: item.instructions as string | null,
      times: item.times as string[],
    })),
    emergencyContacts: emergencyContacts.map((item) => ({
      name: item.name as string | null,
      phone: item.phone as string,
    })),
    lastUpdated: value.lastUpdated,
  };
}

export async function fetchPublicEmergencyCard(
  rawToken: string,
  fetcher: typeof fetch = fetch,
  configuredApiBaseUrl =
    process.env.EXPO_PUBLIC_EMERGENCY_RESPONDER_API_BASE_URL,
): Promise<EmergencyMedicalCard> {
  if (!isCanonicalEmergencyToken(rawToken)) {
    throw new PublicEmergencyCardError("unavailable");
  }

  // The responder runs on a different phone, so the native app's API URL is
  // never a safe fallback here (it is commonly a private LAN address).
  const apiBaseUrl = normalizeResponderBaseUrl(configuredApiBaseUrl);
  if (!apiBaseUrl) {
    throw new PublicEmergencyCardError("configuration");
  }

  let response: Response;
  try {
    response = await fetcher(`${apiBaseUrl}/api/emergency/public/card`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${rawToken}`,
      },
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new PublicEmergencyCardError("retry");
  }

  if (response.status === 404) {
    throw new PublicEmergencyCardError("unavailable");
  }
  if (!response.ok) {
    throw new PublicEmergencyCardError("retry");
  }

  try {
    const card = parseEmergencyMedicalCard(await response.json());
    if (!card) throw new PublicEmergencyCardError("retry");
    return card;
  } catch (error) {
    if (error instanceof PublicEmergencyCardError) throw error;
    throw new PublicEmergencyCardError("retry");
  }
}
