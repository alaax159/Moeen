import { Platform } from 'react-native';

import { authenticatedFetch } from '@/api/authenticated-fetch';

import type {
  NotificationPreferences,
  UpdateNotificationPreferencesInput,
} from './types';

const DEFAULT_API_BASE_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://localhost:3000';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ??
  DEFAULT_API_BASE_URL;

async function parseResponse(response: Response): Promise<unknown> {
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

function getErrorMessage(
  responseData: unknown,
  fallback: string,
): string {
  if (
    typeof responseData !== 'object' ||
    responseData === null ||
    !('message' in responseData)
  ) {
    return fallback;
  }

  const message = responseData.message;

  if (Array.isArray(message)) {
    return message.join('\n');
  }

  return String(message);
}

export async function updateNotificationPreferences(
  input: UpdateNotificationPreferencesInput,
): Promise<unknown> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/notification-preferences`,
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
    throw new Error(
      getErrorMessage(
        responseData,
        `Unable to update notification preferences (${response.status}).`,
      ),
    );
  }

  return responseData;
}

function isNotificationPreferences(
  value: unknown,
): value is NotificationPreferences {
  return (
    typeof value === 'object' &&
    value !== null &&
    'emergencyContactSmsEnabled' in value &&
    typeof (value as Record<string, unknown>).emergencyContactSmsEnabled ===
      'boolean'
  );
}


export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/notification-preferences`,
    { method: 'GET' },
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        responseData,
        `Unable to load notification preferences (${response.status}).`,
      ),
    );
  }

  if (!isNotificationPreferences(responseData)) {
    throw new Error('Unable to load notification preferences.');
  }

  return responseData;
}
