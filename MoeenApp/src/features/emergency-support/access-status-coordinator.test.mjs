import assert from "node:assert/strict";
import test from "node:test";

import {
  credentialBelongsToOwner,
  EmergencyAccessStatusCoordinator,
  reconcileCredentialOwnerValue,
} from "./access-status-coordinator.ts";

const credential = (
  ownerUid = "user-a",
  version = 1,
  rawToken = "token-1",
) => ({
  ownerUid,
  rawToken,
  version,
});

test("an older refresh cannot delete a credential saved by regenerate", async () => {
  const coordinator = new EmergencyAccessStatusCoordinator();
  let stored = credential();
  let resolveOldStatus;
  const oldStatus = new Promise((resolve) => {
    resolveOldStatus = resolve;
  });

  const oldRequestId = coordinator.beginStatusRequest();
  const oldRefresh = oldStatus.then((status) =>
    coordinator.reconcileStatus(
      oldRequestId,
      status,
      "user-a",
      async () => stored,
      async () => {
        stored = null;
      },
    ),
  );

  coordinator.invalidateStatusRequests();
  await coordinator.runCredentialOperation(async () => {
    stored = credential("user-a", 2, "token-2");
  });
  resolveOldStatus({ enabled: true, version: 1 });

  assert.deepEqual(await oldRefresh, { kind: "ignored" });
  assert.deepEqual(stored, credential("user-a", 2, "token-2"));
});

test("only the newest overlapping focus/refresh request reconciles", async () => {
  const coordinator = new EmergencyAccessStatusCoordinator();
  const first = coordinator.beginStatusRequest();
  const second = coordinator.beginStatusRequest();
  let clears = 0;
  const dependencies = [
    async () => credential("user-a", 2, "current-token"),
    async () => {
      clears += 1;
    },
  ];

  const newer = await coordinator.reconcileStatus(
    second,
    { enabled: true, version: 2 },
    "user-a",
    ...dependencies,
  );
  const older = await coordinator.reconcileStatus(
    first,
    { enabled: false, version: 1 },
    "user-a",
    ...dependencies,
  );

  assert.deepEqual(newer, { kind: "available", rawToken: "current-token" });
  assert.deepEqual(older, { kind: "ignored" });
  assert.equal(clears, 0);
});

test("logout and account changes clear the previous credential", async () => {
  for (const currentUid of [null, "user-b"]) {
    let clears = 0;
    await reconcileCredentialOwnerValue(credential(), currentUid, async () => {
      clears += 1;
    });
    assert.equal(clears, 1);
  }
});

test("a credential owned by another user is rejected", () => {
  assert.equal(credentialBelongsToOwner(credential("user-a"), "user-b"), false);
  assert.equal(credentialBelongsToOwner(credential("user-a"), "user-a"), true);
});

test("disabled and version-mismatched status clear the credential", async () => {
  for (const status of [
    { enabled: false, version: 1 },
    { enabled: true, version: 2 },
  ]) {
    const coordinator = new EmergencyAccessStatusCoordinator();
    const requestId = coordinator.beginStatusRequest();
    let stored = credential();
    const result = await coordinator.reconcileStatus(
      requestId,
      status,
      "user-a",
      async () => stored,
      async () => {
        stored = null;
      },
    );
    assert.deepEqual(result, { kind: "unavailable" });
    assert.equal(stored, null);
  }
});

test("matching owner, enabled status, and version restore the credential", async () => {
  const coordinator = new EmergencyAccessStatusCoordinator();
  const requestId = coordinator.beginStatusRequest();
  let clears = 0;
  const result = await coordinator.reconcileStatus(
    requestId,
    { enabled: true, version: 3 },
    "user-a",
    async () => credential("user-a", 3, "restored-token"),
    async () => {
      clears += 1;
    },
  );
  assert.deepEqual(result, { kind: "available", rawToken: "restored-token" });
  assert.equal(clears, 0);
});
