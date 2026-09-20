import { Platform } from "react-native";

import { authenticatedFetch } from "@/api/authenticated-fetch";

const DEFAULT_API_BASE_URL =
  Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? DEFAULT_API_BASE_URL;

const AUTH_SYNC_TIMEOUT_MS = 12_000;

export class AuthApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthApiError";
  }
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
  if (typeof data !== "object" || data === null || !("message" in data)) {
    return fallback;
  }

  const message = (data as { message: unknown }).message;

  return Array.isArray(message) ? message.join("\n") : String(message);
}

export async function syncUser(): Promise<void> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(
        new AuthApiError(
          "Unable to connect to Moeen. Check your network and try again.",
        ),
      );
    }, AUTH_SYNC_TIMEOUT_MS);
  });

  let response: Response;

  try {
    response = await Promise.race([
      authenticatedFetch(`${API_BASE_URL}/users/me`, {
        signal: controller.signal,
      }),
      timeout,
    ]);
  } catch (error) {
    if (error instanceof AuthApiError) {
      throw error;
    }

    throw new AuthApiError(
      "Unable to connect to Moeen. Check your network and try again.",
    );
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new AuthApiError(
      getErrorMessage(
        responseData,
        `Unable to save your account (${response.status}).`,
      ),
    );
  }
}
