// Owner-scoping rules for the Android lock-screen opt-in, kept free of native
// imports so they can be tested directly.

export type EmergencyLockscreenModule = {
  isOptedIn(ownerUid: string): Promise<boolean>;
  setOptedIn(ownerUid: string, enabled: boolean): Promise<void>;
  showQr(ownerUid: string, encodedPng: string): Promise<boolean>;
  clear(): Promise<void>;
};

// An empty uid can never match a stored owner, so it never counts as opted in
// and never publishes.
export function normalizeOwnerUid(ownerUid: string | null | undefined): string {
  return ownerUid?.trim() ?? "";
}

export async function isOptedInForOwner(
  module: EmergencyLockscreenModule | null,
  ownerUid: string | null | undefined,
): Promise<boolean> {
  const uid = normalizeOwnerUid(ownerUid);
  if (!uid) return false;

  return (await module?.isOptedIn(uid)) ?? false;
}

export async function setOptInForOwner(
  module: EmergencyLockscreenModule | null,
  ownerUid: string | null | undefined,
  enabled: boolean,
): Promise<void> {
  const uid = normalizeOwnerUid(ownerUid);

  // Without a signed-in owner there is nobody to opt in, so the only safe
  // action is to clear any opt-in left by a previous account.
  if (!uid) {
    await module?.clear();
    return;
  }

  await module?.setOptedIn(uid, enabled);
}

export async function publishForOwner(
  module: EmergencyLockscreenModule | null,
  ownerUid: string | null | undefined,
  encodedPng: string,
): Promise<boolean> {
  const uid = normalizeOwnerUid(ownerUid);
  if (!uid) return false;

  // The native side re-checks ownership and notification availability, and
  // returns false when the QR is not actually on the lock screen.
  return (await module?.showQr(uid, encodedPng)) ?? false;
}

// Publishes for the owner and, when the native side reports failure, rolls the
// owner's opt-in back so the screen cannot claim the QR is on the lock screen.
// Only the lock-screen opt-in is touched: backend Emergency Access and the
// emergency token are deliberately left alone.
export async function publishForOwnerWithRollback(
  module: EmergencyLockscreenModule | null,
  ownerUid: string | null | undefined,
  encodedPng: string,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  if (await publishForOwner(module, ownerUid, encodedPng)) return true;

  // A newer publish or a toggle already superseded this attempt, so rolling
  // back here would undo that newer opt-in.
  if (!isCurrent()) return false;

  // Best effort: the opt-in must end up cleared even if these calls fail,
  // otherwise the screen keeps showing "Enabled" for a QR nobody can see.
  try {
    await setOptInForOwner(module, ownerUid, false);
  } catch {
    // ignored
  }
  try {
    await clearOptIn(module);
  } catch {
    // ignored
  }
  return false;
}

// Removes the visible QR and the stored opt-in owner, so logout, account
// change, revocation and version mismatch all reset lock-screen ownership.
export async function clearOptIn(
  module: EmergencyLockscreenModule | null,
): Promise<void> {
  await module?.clear();
}
