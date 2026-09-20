import { Platform } from 'react-native';

import { authenticatedFetch } from '@/api/authenticated-fetch';

import type {
  EmergencyContactInput,
  EmergencyContactRecord,
  EmergencyContactUpdate,
} from './contacts-types';

type FetchInit = Parameters<typeof fetch>[1];

const DEFAULT_API_BASE_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://localhost:3000';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ??
  DEFAULT_API_BASE_URL;

const CONTACTS_URL = `${API_BASE_URL}/api/emergency-support/contacts`;

export const CONTACTS_NETWORK_ERROR =
  'Unable to reach the server. Check your connection and try again.';
export const CONTACTS_SESSION_ERROR =
  'Your session has expired. Please sign in again.';
export const CONTACTS_GENERIC_ERROR = 'Something went wrong. Please try again.';
export const LAST_CONTACT_DELETE_ERROR =
  'This is your only emergency contact. Add another contact before you remove this one.';

type EmergencyContactsApiErrorCode = 'LAST_CONTACT';

export class EmergencyContactsApiError extends Error {
  code?: EmergencyContactsApiErrorCode;

  constructor(message: string, code?: EmergencyContactsApiErrorCode) {
    super(message);
    this.name = 'EmergencyContactsApiError';
    this.code = code;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUnauthenticatedError(error: unknown): boolean {
  if (!isObject(error)) {
    return false;
  }

  return (
    error.message === 'User is not authenticated.' ||
    error.code === 'auth/user-token-expired' ||
    error.code === 'auth/user-disabled'
  );
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (!isObject(data) || !('message' in data)) {
    return fallback;
  }

  const { message } = data;

  return Array.isArray(message) ? message.join('\n') : String(message);
}

function isContactRecord(value: unknown): value is EmergencyContactRecord {
  return (
    isObject(value) &&
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.phone === 'string' &&
    (value.relationship === null || typeof value.relationship === 'string') &&
    typeof value.isPrimary === 'boolean'
  );
}

interface ApiResult {
  status: number;
  ok: boolean;
  data: unknown;
}

async function request(path: string, init?: FetchInit): Promise<ApiResult> {
  let response: Response;

  try {
    response = await authenticatedFetch(`${CONTACTS_URL}${path}`, init);
  } catch (error) {
    if (isUnauthenticatedError(error)) {
      throw new EmergencyContactsApiError(CONTACTS_SESSION_ERROR);
    }

    if (error instanceof TypeError) {
      throw new EmergencyContactsApiError(CONTACTS_NETWORK_ERROR);
    }

    throw new EmergencyContactsApiError(CONTACTS_GENERIC_ERROR);
  }

  let text: string;

  try {
    text = await response.text();
  } catch {
    throw new EmergencyContactsApiError(CONTACTS_NETWORK_ERROR);
  }

  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { status: response.status, ok: response.ok, data };
}

function jsonInit(method: string, body?: unknown): FetchInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

function ensureOk(result: ApiResult, fallback: string): void {
  if (result.ok) {
    return;
  }

  if (result.status === 401 || result.status === 403) {
    throw new EmergencyContactsApiError(CONTACTS_SESSION_ERROR);
  }

  throw new EmergencyContactsApiError(getErrorMessage(result.data, fallback));
}

export async function getEmergencyContacts(): Promise<EmergencyContactRecord[]> {
  const result = await request('');
  ensureOk(result, CONTACTS_GENERIC_ERROR);

  if (!Array.isArray(result.data) || !result.data.every(isContactRecord)) {
    throw new EmergencyContactsApiError(CONTACTS_GENERIC_ERROR);
  }

  return result.data;
}

export async function addEmergencyContact(
  input: EmergencyContactInput,
): Promise<EmergencyContactRecord> {
  const result = await request('', jsonInit('POST', input));
  ensureOk(result, 'Unable to add this contact. Please try again.');

  if (!isContactRecord(result.data)) {
    throw new EmergencyContactsApiError(CONTACTS_GENERIC_ERROR);
  }

  return result.data;
}

export async function updateEmergencyContact(
  id: number,
  input: EmergencyContactUpdate,
): Promise<EmergencyContactRecord> {
  const result = await request(`/${id}`, jsonInit('PUT', input));
  ensureOk(result, 'Unable to update this contact. Please try again.');

  if (!isContactRecord(result.data)) {
    throw new EmergencyContactsApiError(CONTACTS_GENERIC_ERROR);
  }

  return result.data;
}

export async function deleteEmergencyContact(id: number): Promise<void> {
  const result = await request(`/${id}`, { method: 'DELETE' });

  if (result.status === 409) {
    throw new EmergencyContactsApiError(
      LAST_CONTACT_DELETE_ERROR,
      'LAST_CONTACT',
    );
  }

  ensureOk(result, 'Unable to remove this contact. Please try again.');
}

export async function setPrimaryEmergencyContact(
  id: number,
): Promise<EmergencyContactRecord> {
  const result = await request(`/${id}/primary`, { method: 'PUT' });
  ensureOk(result, 'Unable to set the primary contact. Please try again.');

  if (!isContactRecord(result.data)) {
    throw new EmergencyContactsApiError(CONTACTS_GENERIC_ERROR);
  }

  return result.data;
}
