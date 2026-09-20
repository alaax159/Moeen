import { Platform } from "react-native";

import { authenticatedFetch } from "@/api/authenticated-fetch";

import type { AddMedicationPayload } from "./types";

const DEFAULT_API_BASE_URL =
  Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? DEFAULT_API_BASE_URL;

export type AddedUserMedication = {
  id: number;
  medicationId: number;
  frequency: number;
  dosageAmount: string;
  dosageUnit: string;
  dosageForm: string;
  instructions: string | null;
  status: string;
  completion: string;
  startDate: string;
  endDate: string;
  createdAt: string;
};

export type AddedScheduleTime = {
  id: number;
  userMedicationId: number;
  time: string;
  createdAt: string;
};

export type AddMedicationResponse = {
  medicationId: number;
  userMedication: AddedUserMedication;
  scheduleTimes: AddedScheduleTime[];
};

export type MedicationSafetyWarning = {
  warningType: "drug_drug" | "drug_allergy" | "drug_condition";
  severity: string;
  message: string;

  // The allergy or condition name this warning is about. Absent for
  // drug_drug warnings, which involve two medications rather than one
  // named allergy/condition.
  affected?: string;
};

export type DuplicateMedication = {
  userMedicationId: number;
  medicationId: number;
  name: string;
};

export type MedicationSafetyResult = {
  safe: boolean;
  warnings: MedicationSafetyWarning[];
  duplicateMedication: DuplicateMedication | null;
};

export class AddMedicationApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AddMedicationApiError";
  }
}

async function postMedication<T>(
  path: string,
  payload: AddMedicationPayload,
): Promise<T> {
  const response = await authenticatedFetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  let responseData: unknown = null;

  if (responseText) {
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }
  }

  if (!response.ok) {
    const message =
      typeof responseData === "object" &&
      responseData !== null &&
      "message" in responseData
        ? String(responseData.message)
        : `Request failed (${response.status}).`;

    throw new AddMedicationApiError(message, response.status);
  }

  return responseData as T;
}

// Runs the safety checks against the not-yet-saved medication. Nothing is
// written to the database by this call — the caller decides whether to
// proceed to addMedication() based on the returned warnings.
export function checkMedicationSafety(
  payload: AddMedicationPayload,
): Promise<MedicationSafetyResult> {
  return postMedication<MedicationSafetyResult>(
    "/medication/add-medication/check-safety",
    payload,
  );
}

export function addMedication(
  payload: AddMedicationPayload,
): Promise<AddMedicationResponse> {
  return postMedication<AddMedicationResponse>(
    "/medication/add-medication",
    payload,
  );
}
