import assert from "node:assert/strict";
import test from "node:test";

import {
  clearOptIn,
  isOptedInForOwner,
  publishForOwner,
  publishForOwnerWithRollback,
  setOptInForOwner,
} from "./lockscreen-owner.ts";

// Stands in for the native module. `optedInOwner` mirrors the uid the native
// side stores, so opt-in ownership can be asserted from the JS contract.
function fakeNative({ notificationsBlocked = false } = {}) {
  const calls = [];
  let optedInOwner = null;
  let published = null;

  return {
    calls,
    get optedInOwner() {
      return optedInOwner;
    },
    get published() {
      return published;
    },
    async isOptedIn(ownerUid) {
      calls.push(["isOptedIn", ownerUid]);
      return optedInOwner !== null && optedInOwner === ownerUid;
    },
    async setOptedIn(ownerUid, enabled) {
      calls.push(["setOptedIn", ownerUid, enabled]);
      optedInOwner = enabled ? ownerUid : null;
      if (!enabled) published = null;
    },
    async showQr(ownerUid, encodedPng) {
      calls.push(["showQr", ownerUid]);
      // The native module refuses to publish for anyone but the opted-in
      // owner, and refuses when the notification cannot actually be shown.
      if (optedInOwner === null || optedInOwner !== ownerUid) return false;
      if (notificationsBlocked) return false;
      published = encodedPng;
      return true;
    },
    async clear() {
      calls.push(["clear"]);
      optedInOwner = null;
      published = null;
    },
  };
}

// --- opt-in ownership -----------------------------------------------------

test("a second account does not inherit the first account's opt-in", async () => {
  const native = fakeNative();

  await setOptInForOwner(native, "user-a", true);
  assert.equal(await isOptedInForOwner(native, "user-a"), true);

  // User B signs in on the same device without opting in.
  assert.equal(await isOptedInForOwner(native, "user-b"), false);
});

test("a second account cannot publish on the first account's opt-in", async () => {
  const native = fakeNative();

  await setOptInForOwner(native, "user-a", true);

  assert.equal(await publishForOwner(native, "user-b", "png-b"), false);
  assert.equal(native.published, null);
});

test("clearing the credential resets the stored opt-in owner", async () => {
  const native = fakeNative();

  await setOptInForOwner(native, "user-a", true);
  assert.equal(await publishForOwner(native, "user-a", "png"), true);

  // Logout, account change, revocation and version mismatch route here.
  await clearOptIn(native);

  assert.equal(native.optedInOwner, null);
  assert.equal(native.published, null);
  assert.equal(await isOptedInForOwner(native, "user-a"), false);
});

test("a new user must opt in explicitly before a QR can be published", async () => {
  const native = fakeNative();

  await setOptInForOwner(native, "user-a", true);
  await clearOptIn(native);

  // User B signs in: publishing stays refused until they opt in themselves.
  assert.equal(await publishForOwner(native, "user-b", "png"), false);

  await setOptInForOwner(native, "user-b", true);
  assert.equal(await publishForOwner(native, "user-b", "png"), true);
});

test("disabling the opt-in removes it for that owner", async () => {
  const native = fakeNative();

  await setOptInForOwner(native, "user-a", true);
  await setOptInForOwner(native, "user-a", false);

  assert.equal(native.optedInOwner, null);
  assert.equal(await isOptedInForOwner(native, "user-a"), false);
});

test("a missing owner never counts as opted in and never publishes", async () => {
  const native = fakeNative();

  assert.equal(await isOptedInForOwner(native, null), false);
  assert.equal(await isOptedInForOwner(native, "   "), false);
  assert.equal(await publishForOwner(native, null, "png"), false);
  assert.equal(native.published, null);
});

test("enabling without a signed-in owner clears instead of opting in", async () => {
  const native = fakeNative();

  await setOptInForOwner(native, "user-a", true);
  await setOptInForOwner(native, null, true);

  assert.equal(native.optedInOwner, null);
  assert.deepEqual(native.calls.at(-1), ["clear"]);
});

test("the owner uid is trimmed before it is matched", async () => {
  const native = fakeNative();

  await setOptInForOwner(native, "  user-a  ", true);

  assert.equal(native.optedInOwner, "user-a");
  assert.equal(await isOptedInForOwner(native, "user-a"), true);
});

// --- notification availability -------------------------------------------

test("publish reports failure when notifications are blocked", async () => {
  const native = fakeNative({ notificationsBlocked: true });

  await setOptInForOwner(native, "user-a", true);

  // The user opted in, but the channel/permission is blocked, so the UI must
  // not claim the QR is on the lock screen.
  assert.equal(await publishForOwner(native, "user-a", "png"), false);
  assert.equal(native.published, null);
});

// --- platform guard -------------------------------------------------------

test("every entry point is inert when the native module is absent", async () => {
  assert.equal(await isOptedInForOwner(null, "user-a"), false);
  assert.equal(await publishForOwner(null, "user-a", "png"), false);
  await setOptInForOwner(null, "user-a", true);
  await clearOptIn(null);
});

// --- publish failure rolls the opt-in back --------------------------------

test("a successful publish leaves the owner opted in", async () => {
  const native = fakeNative();
  await setOptInForOwner(native, "user-a", true);

  assert.equal(
    await publishForOwnerWithRollback(native, "user-a", "png"),
    true,
  );

  // Enabled: the opt-in survives and the QR is on the lock screen.
  assert.equal(await isOptedInForOwner(native, "user-a"), true);
  assert.equal(native.published, "png");
});

test("a failed publish rolls back the owner's opt-in instead of showing Enabled", async () => {
  const native = fakeNative({ notificationsBlocked: true });
  await setOptInForOwner(native, "user-a", true);

  assert.equal(
    await publishForOwnerWithRollback(native, "user-a", "png"),
    false,
  );

  // Disabled, not Enabled: the opt-in is gone and no stale notification is left.
  assert.equal(await isOptedInForOwner(native, "user-a"), false);
  assert.equal(native.optedInOwner, null);
  assert.equal(native.published, null);
});

test("backend Emergency Access and the token survive a lock-screen publish failure", async () => {
  const native = fakeNative({ notificationsBlocked: true });
  await setOptInForOwner(native, "user-a", true);

  // Stands in for backend state; the rollback has no way to reach it, and the
  // call log proves it only touched lock-screen opt-in ownership.
  const backend = { emergencyAccessEnabled: true, token: "token-1" };

  assert.equal(
    await publishForOwnerWithRollback(native, "user-a", "png"),
    false,
  );

  assert.equal(backend.emergencyAccessEnabled, true);
  assert.equal(backend.token, "token-1");
  assert.deepEqual(
    native.calls.map(([name]) => name),
    ["setOptedIn", "showQr", "setOptedIn", "clear"],
  );
});

test("a superseded publish failure does not roll back a newer opt-in", async () => {
  const native = fakeNative({ notificationsBlocked: true });
  await setOptInForOwner(native, "user-a", true);

  assert.equal(
    await publishForOwnerWithRollback(native, "user-a", "png", () => false),
    false,
  );

  // A newer publish/toggle owns the state now, so it must be left intact.
  assert.equal(await isOptedInForOwner(native, "user-a"), true);
});

test("the opt-in is still cleared when the native rollback throws", async () => {
  const native = fakeNative({ notificationsBlocked: true });
  await setOptInForOwner(native, "user-a", true);
  native.setOptedIn = async () => {
    throw new Error("native failure");
  };

  assert.equal(
    await publishForOwnerWithRollback(native, "user-a", "png"),
    false,
  );

  // clear() still ran, so no stale lock-screen notification remains.
  assert.equal(native.optedInOwner, null);
  assert.equal(native.published, null);
});
