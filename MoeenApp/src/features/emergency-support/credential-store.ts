import * as SecureStore from "expo-secure-store";

import {
  credentialBelongsToOwner,
  reconcileCredentialOwnerValue,
} from "./access-status-coordinator";
import { clearEmergencyLockscreenQr } from "./android-lockscreen";

const EMERGENCY_ACCESS_CREDENTIAL_KEY = "moeen.emergency-access.credential.v1";

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export interface EmergencyAccessCredential {
  ownerUid: string;
  rawToken: string;
  version: number;
}

function isCredential(value: unknown): value is EmergencyAccessCredential {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.ownerUid === "string" &&
    candidate.ownerUid.length > 0 &&
    typeof candidate.rawToken === "string" &&
    candidate.rawToken.length > 0 &&
    Number.isInteger(candidate.version) &&
    Number(candidate.version) > 0
  );
}

async function secureStoreAvailable(): Promise<boolean> {
  return SecureStore.isAvailableAsync();
}

async function readCredential(): Promise<EmergencyAccessCredential | null> {
  if (!(await secureStoreAvailable())) return null;

  const stored = await SecureStore.getItemAsync(
    EMERGENCY_ACCESS_CREDENTIAL_KEY,
    SECURE_STORE_OPTIONS,
  );
  if (!stored) return null;

  try {
    const parsed: unknown = JSON.parse(stored);
    if (isCredential(parsed)) return parsed;
  } catch {
    // Invalid secure data is deleted below and is never surfaced to the UI.
  }

  await clearEmergencyAccessCredential();
  return null;
}

export async function loadEmergencyAccessCredential(
  ownerUid: string,
): Promise<EmergencyAccessCredential | null> {
  const credential = await readCredential();
  if (!credential) return null;

  if (!credentialBelongsToOwner(credential, ownerUid)) {
    await clearEmergencyAccessCredential();
    return null;
  }

  return credential;
}

export async function saveEmergencyAccessCredential(
  credential: EmergencyAccessCredential,
): Promise<void> {
  if (!(await secureStoreAvailable())) {
    throw new Error("Secure credential storage is unavailable");
  }

  await SecureStore.setItemAsync(
    EMERGENCY_ACCESS_CREDENTIAL_KEY,
    JSON.stringify(credential),
    SECURE_STORE_OPTIONS,
  );
}

export async function clearEmergencyAccessCredential(): Promise<void> {
  const operations: Promise<unknown>[] = [clearEmergencyLockscreenQr()];
  if (await secureStoreAvailable()) {
    operations.push(
      SecureStore.deleteItemAsync(
        EMERGENCY_ACCESS_CREDENTIAL_KEY,
        SECURE_STORE_OPTIONS,
      ),
    );
  }
  const results = await Promise.allSettled(operations);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure) throw failure.reason;
}

/**
 * Called by the global auth-state listener so a credential cannot cross users.
 */
export async function reconcileEmergencyCredentialOwner(
  currentUid: string | null,
): Promise<void> {
  const credential = await readCredential();
  await reconcileCredentialOwnerValue(
    credential,
    currentUid,
    clearEmergencyAccessCredential,
  );
}
