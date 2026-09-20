import { Platform } from "react-native";

import { authenticatedFetch } from "@/api/authenticated-fetch";

const DEFAULT_API_BASE_URL =
  Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? DEFAULT_API_BASE_URL;

export type ActiveInteraction = {
  warningType: "drug_drug" | "drug_allergy" | "drug_condition";
  severity: string;
  message: string;
};

type ActiveInteractionsResponse = {
  interactions: ActiveInteraction[];
};

export async function getActiveInteractions(): Promise<ActiveInteraction[]> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/medication-safety/active-interactions`,
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
    throw new Error(`Unable to load active interactions (${response.status}).`);
  }

  const data = responseData as ActiveInteractionsResponse;

  return Array.isArray(data?.interactions) ? data.interactions : [];
}
