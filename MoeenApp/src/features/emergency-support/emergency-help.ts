import * as Linking from 'expo-linking';
import { Alert } from 'react-native';

import { getEmergencyContacts } from './contacts-api';
import type { EmergencyContactRecord } from './contacts-types';

// Palestinian Red Crescent emergency line. Hardcoded for this release — making
// the number configurable / region-aware is a separate decision.
export const EMERGENCY_SERVICES_NUMBER = '101';
export const EMERGENCY_SERVICES_LABEL = 'Palestinian Red Crescent';

/**
 * Returns the user's primary emergency contact, or null if they have none.
 * Throws (EmergencyContactsApiError) if the fetch fails — callers MUST handle
 * that so the "call emergency services" path still works offline / signed out.
 */
export async function getPrimaryEmergencyContact(): Promise<EmergencyContactRecord | null> {
  const contacts = await getEmergencyContacts();
  return contacts.find((contact) => contact.isPrimary) ?? null;
}

/**
 * Opens the native dialer pre-filled with `phoneNumber`. Never places the
 * call — the user makes the final tap in their dialer app. Falls back to an
 * alert when there is no dialer (iOS simulator, a tablet with no telephony).
 */
export async function openDialer(phoneNumber: string): Promise<void> {
  try {
    await Linking.openURL(`tel:${phoneNumber}`);
  } catch {
    Alert.alert(
      'Unable to open the dialer',
      `Dial ${phoneNumber} from your phone app to reach help.`,
    );
  }
}
