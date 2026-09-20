import { Platform } from 'react-native';

import { authenticatedFetch } from '@/api/authenticated-fetch';

import type {
  TodayDose,
  WeeklyDosesResponse,
} from './types';

const DEFAULT_API_BASE_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://localhost:3000';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ??
  DEFAULT_API_BASE_URL;

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

export async function getTodayDoses(): Promise<TodayDose[]> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/doses/today`,
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        responseData,
        `Unable to load today's schedule (${response.status}).`,
      ),
    );
  }

  return responseData as TodayDose[];
}

export async function getWeeklyDoses(
  signal?: AbortSignal,
): Promise<WeeklyDosesResponse> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/doses/weekly`,
    { signal },
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        responseData,
        `Unable to load weekly adherence (${response.status}).`,
      ),
    );
  }

  return responseData as WeeklyDosesResponse;
}

export async function markDoseTaken(
  scheduleTimeId: number,
): Promise<void> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/medications/schedule-times/${scheduleTimeId}/taken`,
    { method: 'POST' },
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        responseData,
        `Unable to mark dose as taken (${response.status}).`,
      ),
    );
  }
}

export async function markDoseSkipped(
  scheduleTimeId: number,
): Promise<void> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/medications/schedule-times/${scheduleTimeId}/skip`,
    { method: 'POST' },
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        responseData,
        `Unable to mark dose as skipped (${response.status}).`,
      ),
    );
  }
}

export async function markDoseSnoozed(
  scheduleTimeId: number,
): Promise<void> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/medications/schedule-times/${scheduleTimeId}/snooze`,
    { method: 'POST' },
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        responseData,
        `Unable to snooze dose (${response.status}).`,
      ),
    );
  }
}

export async function markDoseDismissed(
  scheduleTimeId: number,
): Promise<void> {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/medications/schedule-times/${scheduleTimeId}/dismiss`,
    { method: 'POST' },
  );

  const responseData = await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(
        responseData,
        `Unable to dismiss dose (${response.status}).`,
      ),
    );
  }
}
