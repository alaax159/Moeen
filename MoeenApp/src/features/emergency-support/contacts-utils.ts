import type { EmergencyContactRecord } from './contacts-types';

// Matches the backend's E.164 validation (a leading '+', no leading zero,
// 8-15 digits total). Same expression as health-profile/utils.ts — copied
// rather than shared so the two features stay decoupled.
export const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

export const MAX_NAME_LENGTH = 100;
export const MAX_RELATIONSHIP_LENGTH = 100;

export function isValidE164(phone: string): boolean {
  return E164_PHONE_PATTERN.test(phone.trim());
}

/**
 * Orders contacts the same way `GET /contacts` does: primary first, then by
 * `createdAt` ascending. Used to keep the in-memory list identical to a fresh
 * GET after a local mutation that changes who is primary (add-first-contact,
 * set-primary), so the list doesn't visibly reshuffle on the next refresh.
 */
export function sortContacts(
  list: EmergencyContactRecord[],
): EmergencyContactRecord[] {
  return [...list].sort(
    (a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}
