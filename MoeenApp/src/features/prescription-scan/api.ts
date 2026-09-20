import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";

import { auth } from "@/firebase/config";

import { authenticatedFetch } from "@/api/authenticated-fetch";

import type {
  PrescriptionConfirmMedication,
  PrescriptionConfirmResult,
  PrescriptionImageFile,
  PrescriptionScanDraft,
} from "./types";

const DEFAULT_API_BASE_URL =
  Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? DEFAULT_API_BASE_URL;

const GENERIC_SCAN_ERROR = "Unable to scan the prescription. Please try again.";

const SAFE_ERROR_MESSAGES: Partial<Record<number, string>> = {
  400: "Please select a valid prescription image.",
  401: "Your session has expired. Please sign in again.",
  413: "The prescription file is too large",
  422: "No medication could be identified in this prescription.",
  502: GENERIC_SCAN_ERROR,
  503: GENERIC_SCAN_ERROR,
};

export class PrescriptionScanApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PrescriptionScanApiError";
  }
}

export async function scanPrescription(
  file: PrescriptionImageFile,
): Promise<PrescriptionScanDraft> {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("User is not authenticated.");
  }

  const token = await user.getIdToken();

  const uploadFile = new File(file.uri);

  const formData = new FormData();
  formData.append("file", uploadFile);

  const response = await expoFetch(`${API_BASE_URL}/api/prescriptions/scan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new PrescriptionScanApiError(
      SAFE_ERROR_MESSAGES[response.status] ?? GENERIC_SCAN_ERROR,
      response.status,
    );
  }

  return (await response.json()) as PrescriptionScanDraft;
}

const GENERIC_CONFIRM_ERROR =
  "Unable to add the medications. Please try again.";

// Sends the reviewed medications to the confirmation endpoint, which adds each
// one through the existing add-medication flow and reports a per-medication
// result so partial failures stay visible.
export async function confirmPrescription(
  medications: PrescriptionConfirmMedication[],
): Promise<PrescriptionConfirmResult> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/api/prescriptions/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ medications }),
    },
  );

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
    throw new PrescriptionScanApiError(
      SAFE_ERROR_MESSAGES[response.status] ?? GENERIC_CONFIRM_ERROR,
      response.status,
    );
  }

  return responseData as PrescriptionConfirmResult;
}
