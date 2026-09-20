import { Platform } from "react-native";

import { authenticatedFetch } from "@/api/authenticated-fetch";

import type {
  EmergencyAccessEnableResult,
  EmergencyAccessStatus,
  EmergencyAccessTokenResult,
  EmergencyMedicalCard,
} from "./types";

const DEFAULT_API_BASE_URL =
  Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? DEFAULT_API_BASE_URL;

export const EMERGENCY_CARD_NETWORK_ERROR =
  "Unable to load your Emergency Medical Card. Check your connection and try again.";
export const EMERGENCY_CARD_SESSION_ERROR =
  "Your session has expired. Please sign in again.";
export const EMERGENCY_CARD_GENERIC_ERROR =
  "Unable to load your Emergency Medical Card right now. Please try again.";
export const EMERGENCY_ACCESS_GENERIC_ERROR =
  "Unable to update Emergency Access right now. Please try again.";
export const EMERGENCY_ACCESS_CONFLICT_ERROR =
  "Emergency Access changed on another request. The latest status has been loaded; review it and try again.";

export class EmergencySupportApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EmergencySupportApiError";
  }
}

export function isEmergencyAccessConflict(error: unknown): boolean {
  return error instanceof EmergencySupportApiError && error.status === 409;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEmergencyMedicalCard(value: unknown): value is EmergencyMedicalCard {
  return (
    isObject(value) &&
    isObject(value.patient) &&
    Array.isArray(value.allergies) &&
    Array.isArray(value.chronicConditions) &&
    Array.isArray(value.medications) &&
    Array.isArray(value.emergencyContacts)
  );
}

function isUnauthenticatedError(error: unknown): boolean {
  if (!isObject(error)) {
    return false;
  }

  return (
    error.message === "User is not authenticated." ||
    error.code === "auth/user-token-expired" ||
    error.code === "auth/user-disabled"
  );
}

export async function getEmergencyMedicalCard(): Promise<EmergencyMedicalCard> {
  let response: Response;

  try {
    response = await authenticatedFetch(
      `${API_BASE_URL}/api/emergency-support/card`,
    );
  } catch (error) {
    if (isUnauthenticatedError(error)) {
      throw new EmergencySupportApiError(EMERGENCY_CARD_SESSION_ERROR);
    }

    if (error instanceof TypeError) {
      throw new EmergencySupportApiError(EMERGENCY_CARD_NETWORK_ERROR);
    }

    throw new EmergencySupportApiError(EMERGENCY_CARD_GENERIC_ERROR);
  }

  let text: string;

  try {
    text = await response.text();
  } catch (error) {
    throw new EmergencySupportApiError(
      error instanceof TypeError
        ? EMERGENCY_CARD_NETWORK_ERROR
        : EMERGENCY_CARD_GENERIC_ERROR,
    );
  }

  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new EmergencySupportApiError(
      response.status === 401 || response.status === 403
        ? EMERGENCY_CARD_SESSION_ERROR
        : EMERGENCY_CARD_GENERIC_ERROR,
    );
  }

  if (!isEmergencyMedicalCard(data)) {
    throw new EmergencySupportApiError(EMERGENCY_CARD_GENERIC_ERROR);
  }

  return data;
}

function isAccessStatus(value: unknown): value is EmergencyAccessStatus {
  return (
    isObject(value) &&
    typeof value.enabled === "boolean" &&
    typeof value.configured === "boolean" &&
    Number.isInteger(value.version) &&
    (typeof value.updatedAt === "string" || value.updatedAt === null)
  );
}

function isEnableResult(value: unknown): value is EmergencyAccessEnableResult {
  return (
    isObject(value) &&
    typeof value.enabled === "boolean" &&
    typeof value.tokenGenerated === "boolean" &&
    Number.isInteger(value.version) &&
    typeof value.updatedAt === "string" &&
    (!value.tokenGenerated || typeof value.token === "string")
  );
}

function isTokenResult(value: unknown): value is EmergencyAccessTokenResult {
  return (
    isObject(value) &&
    value.enabled === true &&
    typeof value.token === "string" &&
    Number.isInteger(value.version) &&
    typeof value.updatedAt === "string"
  );
}

async function accessRequest(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await authenticatedFetch(
      `${API_BASE_URL}/api/emergency-support/access${path}`,
      init,
    );
  } catch (error) {
    if (isUnauthenticatedError(error)) {
      throw new EmergencySupportApiError(EMERGENCY_CARD_SESSION_ERROR);
    }
    throw new EmergencySupportApiError(
      error instanceof TypeError
        ? EMERGENCY_CARD_NETWORK_ERROR
        : EMERGENCY_ACCESS_GENERIC_ERROR,
    );
  }

  let data: unknown;
  try {
    const text = await response.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new EmergencySupportApiError(EMERGENCY_ACCESS_GENERIC_ERROR);
  }

  if (!response.ok) {
    throw new EmergencySupportApiError(
      response.status === 409
        ? EMERGENCY_ACCESS_CONFLICT_ERROR
        : response.status === 401 || response.status === 403
          ? EMERGENCY_CARD_SESSION_ERROR
          : EMERGENCY_ACCESS_GENERIC_ERROR,
      response.status,
    );
  }

  return data;
}

function mutationInit(expectedVersion?: number): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      expectedVersion === undefined ? {} : { expectedVersion },
    ),
  };
}

export async function getEmergencyAccess(): Promise<EmergencyAccessStatus> {
  const data = await accessRequest("");
  if (!isAccessStatus(data)) {
    throw new EmergencySupportApiError(EMERGENCY_ACCESS_GENERIC_ERROR);
  }
  return data;
}

export async function enableEmergencyAccess(
  expectedVersion?: number,
): Promise<EmergencyAccessEnableResult> {
  const data = await accessRequest("/enable", mutationInit(expectedVersion));
  if (!isEnableResult(data)) {
    throw new EmergencySupportApiError(EMERGENCY_ACCESS_GENERIC_ERROR);
  }
  return data;
}

export async function regenerateEmergencyAccess(
  expectedVersion: number,
): Promise<EmergencyAccessTokenResult> {
  const data = await accessRequest(
    "/regenerate",
    mutationInit(expectedVersion),
  );
  if (!isTokenResult(data)) {
    throw new EmergencySupportApiError(EMERGENCY_ACCESS_GENERIC_ERROR);
  }
  return data;
}

export async function disableEmergencyAccess(
  expectedVersion: number,
): Promise<EmergencyAccessStatus> {
  const data = await accessRequest("/disable", mutationInit(expectedVersion));
  if (!isAccessStatus(data)) {
    throw new EmergencySupportApiError(EMERGENCY_ACCESS_GENERIC_ERROR);
  }
  return data;
}
