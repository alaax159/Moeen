import { Platform } from "react-native";

import { authenticatedFetch } from "@/api/authenticated-fetch";

import type {
  MedicationDetailsResponse,
  UserMedicationDetails,
} from "./types";

const DEFAULT_API_BASE_URL =
  Platform.OS === "android"
    ? "http://10.0.2.2:3000"
    : "http://localhost:3000";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  DEFAULT_API_BASE_URL;

export class MedicationDetailsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "MedicationDetailsApiError";
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

export async function getMedicationDetails(
  userMedicationId: number,
): Promise<MedicationDetailsResponse> {
  if (
    !Number.isInteger(userMedicationId) ||
    userMedicationId <= 0
  ) {
    throw new MedicationDetailsApiError(
      "Invalid medication record ID.",
      400,
    );
  }

  const response = await authenticatedFetch(
    `${API_BASE_URL}/get-medication-info/${userMedicationId}`,
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new MedicationDetailsApiError(
      getErrorMessage(
        responseData,
        `Unable to load medication details (${response.status}).`,
      ),
      response.status,
    );
  }

  return responseData as MedicationDetailsResponse;
}

export async function archiveMedication(
  userMedicationId: number,
): Promise<UserMedicationDetails | null> {
  if (
    !Number.isInteger(userMedicationId) ||
    userMedicationId <= 0
  ) {
    throw new MedicationDetailsApiError(
      "Invalid medication record ID.",
      400,
    );
  }

  const response = await authenticatedFetch(
    `${API_BASE_URL}/medications/${userMedicationId}/archive`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new MedicationDetailsApiError(
      getErrorMessage(
        responseData,
        `Unable to archive medication (${response.status}).`,
      ),
      response.status,
    );
  }

  return responseData as UserMedicationDetails | null;
}
