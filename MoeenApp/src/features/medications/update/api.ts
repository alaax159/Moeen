import { Platform } from "react-native";

import { authenticatedFetch } from "@/api/authenticated-fetch";

import type {
    UpdateMedicationPayload,
    UpdateMedicationResponse,
} from "./types";

const DEFAULT_API_BASE_URL =
  Platform.OS === "android"
    ? "http://10.0.2.2:3000"
    : "http://localhost:3000";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  DEFAULT_API_BASE_URL;

export class UpdateMedicationApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "UpdateMedicationApiError";
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

export async function updateMedication(
  userMedicationId: number,
  payload: UpdateMedicationPayload,
): Promise<UpdateMedicationResponse> {
  if (
    !Number.isInteger(userMedicationId) ||
    userMedicationId <= 0
  ) {
    throw new UpdateMedicationApiError(
      "Invalid medication record ID.",
      400,
    );
  }

  const response = await authenticatedFetch(
    `${API_BASE_URL}/medications/${userMedicationId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new UpdateMedicationApiError(
      getErrorMessage(
        responseData,
        `Unable to update medication (${response.status}).`,
      ),
      response.status,
    );
  }

  return responseData as UpdateMedicationResponse;
}
