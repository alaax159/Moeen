export interface StoredEmergencyCredential {
  ownerUid: string;
  rawToken: string;
  version: number;
}

export interface AccessStatusValue {
  enabled: boolean;
  version: number;
}

export type ReconciliationResult =
  | { kind: "ignored" }
  | { kind: "unavailable" }
  | { kind: "available"; rawToken: string };

export class EmergencyAccessStatusCoordinator {
  private generation = 0;
  private credentialQueue: Promise<void> = Promise.resolve();

  beginStatusRequest(): number {
    this.generation += 1;
    return this.generation;
  }

  invalidateStatusRequests(): void {
    this.generation += 1;
  }

  isLatest(requestId: number): boolean {
    return requestId === this.generation;
  }

  runCredentialOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.credentialQueue.then(operation, operation);
    this.credentialQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  reconcileStatus(
    requestId: number,
    status: AccessStatusValue,
    ownerUid: string | null,
    loadCredential: (
      ownerUid: string,
    ) => Promise<StoredEmergencyCredential | null>,
    clearCredential: () => Promise<void>,
  ): Promise<ReconciliationResult> {
    return this.runCredentialOperation(async () => {
      if (!this.isLatest(requestId)) return { kind: "ignored" };

      if (!ownerUid) {
        await clearCredential();
        return this.isLatest(requestId)
          ? { kind: "unavailable" }
          : { kind: "ignored" };
      }

      const credential = await loadCredential(ownerUid);
      if (!this.isLatest(requestId)) return { kind: "ignored" };

      if (
        status.enabled &&
        credential?.ownerUid === ownerUid &&
        credential.version === status.version
      ) {
        return { kind: "available", rawToken: credential.rawToken };
      }

      await clearCredential();
      return this.isLatest(requestId)
        ? { kind: "unavailable" }
        : { kind: "ignored" };
    });
  }
}

export function credentialBelongsToOwner(
  credential: StoredEmergencyCredential,
  ownerUid: string,
): boolean {
  return credential.ownerUid === ownerUid;
}

export async function reconcileCredentialOwnerValue(
  credential: StoredEmergencyCredential | null,
  currentUid: string | null,
  clearCredential: () => Promise<void>,
): Promise<void> {
  if (credential && credential.ownerUid !== currentUid) {
    await clearCredential();
  }
}
