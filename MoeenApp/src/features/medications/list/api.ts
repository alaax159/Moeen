import { Platform } from "react-native";

import { authenticatedFetch } from "@/api/authenticated-fetch";

import type {
  MedicationSafetyWarning,
  MedicationStatus,
  TodayMedication,
  UserMedicationSummary,
} from "./types";

type UserMedicationSummaryResponse = Omit<
  UserMedicationSummary,
  "brandName" | "genericName"
> & {
  brandName: string | null;
  genericName: string | null;
};

function normalizeUserMedicationSummary(
  medication: UserMedicationSummaryResponse,
): UserMedicationSummary {
  return {
    ...medication,
    brandName:
      typeof medication.brandName === "string"
        ? medication.brandName.trim()
        : "",
    genericName:
      typeof medication.genericName === "string"
        ? medication.genericName.trim()
        : "",
  };
}

const DEFAULT_API_BASE_URL =
  Platform.OS === "android"
    ? "http://10.0.2.2:3000"
    : "http://localhost:3000";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  DEFAULT_API_BASE_URL;

export class MedicationsListApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "MedicationsListApiError";
  }
}

function getErrorMessage(
  responseData: unknown,
  fallback: string,
): string {
  if (
    typeof responseData !== "object" ||
    responseData === null ||
    !("message" in responseData)
  ) {
    return fallback;
  }

  const message = responseData.message;

  if (Array.isArray(message)) {
    return message.join("\n");
  }

  return String(message);
}

async function parseResponse(
  response: Response,
): Promise<unknown> {
  const responseText = await response.text();

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

export async function getUserMedications(
  status?: MedicationStatus,
  signal?: AbortSignal,
): Promise<UserMedicationSummary[]> {
  const url = new URL(
    `${API_BASE_URL}/medications/get_User_medications`,
  );

  if (status) {
    url.searchParams.set("status", status);
  }

  const response = await authenticatedFetch(url.toString(), { signal });

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new MedicationsListApiError(
      getErrorMessage(
        responseData,
        `Unable to load medications (${response.status}).`,
      ),
      response.status,
    );
  }

  return (responseData as UserMedicationSummaryResponse[]).map(
    normalizeUserMedicationSummary,
  );
}

export async function getTodayMedications(): Promise<TodayMedication[]> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/medications/today`,
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new MedicationsListApiError(
      getErrorMessage(
        responseData,
        `Unable to load today's medications (${response.status}).`,
      ),
      response.status,
    );
  }

  return responseData as TodayMedication[];
}

// Not live on the backend yet (lands with the active-interactions
// endpoint). Throws on failure like the other list endpoints — a failed
// safety check must never look the same as a confirmed empty warning
// set, so callers keep their last-known warnings on error instead of
// clearing them.
export async function getActiveInteractions(): Promise<
  MedicationSafetyWarning[]
> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/medication-safety/active-interactions`,
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new MedicationsListApiError(
      getErrorMessage(
        responseData,
        `Unable to load safety warnings (${response.status}).`,
      ),
      response.status,
    );
  }

  const interactions = (
    responseData as { interactions?: MedicationSafetyWarning[] } | null
  )?.interactions;

  return Array.isArray(interactions) ? interactions : [];
}
