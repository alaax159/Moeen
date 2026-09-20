import { ConflictException, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { EmergencyAccessAuditRepository } from '../database/repository/emergency-access-audit.repository';
import {
  EmergencyAccess,
  EmergencyAccessRepository,
} from '../database/repository/emergency-access.repository';
import { EmergencyAccessService } from './emergency-access.service';

class AtomicMemoryRepository {
  access: EmergencyAccess | null = null;

  findByUserId(userId: number): Promise<EmergencyAccess | null> {
    return Promise.resolve(this.access?.userId === userId ? this.access : null);
  }

  createEnabled(
    userId: number,
    tokenHash: string,
  ): Promise<EmergencyAccess | null> {
    if (this.access) return Promise.resolve(null);
    this.access = this.row({ userId, tokenHash, enabled: true, version: 1 });
    return Promise.resolve(this.access);
  }

  reEnable(
    userId: number,
    expectedVersion: number,
    tokenHash: string,
  ): Promise<EmergencyAccess | null> {
    return this.cas(userId, expectedVersion, true, tokenHash);
  }

  regenerate(
    userId: number,
    expectedVersion: number,
    tokenHash: string,
  ): Promise<EmergencyAccess | null> {
    if (!this.access?.enabled) return Promise.resolve(null);
    return this.cas(userId, expectedVersion, true, tokenHash);
  }

  disable(
    userId: number,
    expectedVersion: number,
  ): Promise<EmergencyAccess | null> {
    return this.cas(userId, expectedVersion, false, null);
  }

  private cas(
    userId: number,
    expectedVersion: number,
    enabled: boolean,
    tokenHash: string | null,
  ): Promise<EmergencyAccess | null> {
    if (
      !this.access ||
      this.access.userId !== userId ||
      this.access.version !== expectedVersion
    ) {
      return Promise.resolve(null);
    }
    this.access = {
      ...this.access,
      enabled,
      tokenHash,
      version: this.access.version + 1,
      updatedAt: new Date(this.access.updatedAt.getTime() + 1),
    };
    return Promise.resolve(this.access);
  }

  private row(overrides: Partial<EmergencyAccess>): EmergencyAccess {
    const timestamp = new Date('2026-09-01T10:00:00.000Z');
    return {
      id: 1,
      userId: 42,
      tokenHash: null,
      enabled: false,
      version: 1,
      auditBaselineVersion: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    };
  }
}

function buildAuditRepository() {
  return {
    recordAccessEvent: jest.fn().mockResolvedValue(undefined),
  };
}

describe('EmergencyAccessService optimistic concurrency', () => {
  let repository: AtomicMemoryRepository;
  let auditRepository: ReturnType<typeof buildAuditRepository>;
  let service: EmergencyAccessService;

  beforeEach(() => {
    repository = new AtomicMemoryRepository();
    auditRepository = buildAuditRepository();
    service = new EmergencyAccessService(
      repository as unknown as EmergencyAccessRepository,
      auditRepository as unknown as EmergencyAccessAuditRepository,
    );
  });

  it('reports version zero when access is not configured', async () => {
    await expect(service.getStatus(42)).resolves.toEqual({
      enabled: false,
      configured: false,
      version: 0,
      updatedAt: null,
    });
  });

  it('returns only one token from two concurrent first-enable requests', async () => {
    const results = await Promise.all([service.enable(42), service.enable(42)]);
    const tokenResults = results.filter((result) => result.tokenGenerated);

    expect(tokenResults).toHaveLength(1);
    expect(results.filter((result) => result.token)).toHaveLength(1);
    expect(repository.access?.version).toBe(1);
    expect(repository.access?.tokenHash).toBe(
      createHash('sha256').update(tokenResults[0].token!).digest('hex'),
    );
  });

  it('does not generate or replace a token when already enabled', async () => {
    const first = await service.enable(42);
    const hash = repository.access?.tokenHash;
    const second = await service.enable(42, first.version);

    expect(second).toMatchObject({
      enabled: true,
      tokenGenerated: false,
      version: 1,
    });
    expect(second.token).toBeUndefined();
    expect(repository.access?.tokenHash).toBe(hash);
  });

  it('allows only one concurrent regenerate from the same version', async () => {
    const enabled = await service.enable(42);
    const results = await Promise.allSettled([
      service.regenerate(42, enabled.version),
      service.regenerate(42, enabled.version),
    ]);
    const successes = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof service.regenerate>>
      > => result.status === 'fulfilled',
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toBeInstanceOf(ConflictException);
    expect(repository.access?.tokenHash).toBe(
      createHash('sha256').update(successes[0].value.token).digest('hex'),
    );
    expect(repository.access?.version).toBe(2);
  });

  it('rejects stale regenerate and disable versions', async () => {
    const enabled = await service.enable(42);
    await service.regenerate(42, enabled.version);

    await expect(
      service.regenerate(42, enabled.version),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.disable(42, enabled.version)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects regenerate when Emergency Access is disabled', async () => {
    const enabled = await service.enable(42);
    const disabled = await service.disable(42, enabled.version);

    await expect(
      service.regenerate(42, disabled.version),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.access).toMatchObject({
      enabled: false,
      tokenHash: null,
      version: disabled.version,
    });
  });

  it('disable clears the hash and increments version', async () => {
    const enabled = await service.enable(42);
    const disabled = await service.disable(42, enabled.version);

    expect(disabled).toMatchObject({ enabled: false, version: 2 });
    expect(repository.access?.tokenHash).toBeNull();
  });

  it('requires the current version to re-enable and creates a new token', async () => {
    const enabled = await service.enable(42);
    const originalToken = enabled.token;
    const disabled = await service.disable(42, enabled.version);

    await expect(service.enable(42, enabled.version)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const reEnabled = await service.enable(42, disabled.version);

    expect(reEnabled.tokenGenerated).toBe(true);
    expect(reEnabled.token).not.toBe(originalToken);
    expect(reEnabled.version).toBe(3);
    expect(repository.access?.tokenHash).toBe(
      createHash('sha256').update(reEnabled.token!).digest('hex'),
    );
  });
});

describe('EmergencyAccessService emergency_access_audit logging', () => {
  let repository: AtomicMemoryRepository;
  let auditRepository: ReturnType<typeof buildAuditRepository>;
  let service: EmergencyAccessService;

  beforeEach(() => {
    repository = new AtomicMemoryRepository();
    auditRepository = buildAuditRepository();
    service = new EmergencyAccessService(
      repository as unknown as EmergencyAccessRepository,
      auditRepository as unknown as EmergencyAccessAuditRepository,
    );
  });

  it('records exactly one "enabled" entry on first enable', async () => {
    await service.enable(42);

    expect(auditRepository.recordAccessEvent).toHaveBeenCalledTimes(1);
    expect(auditRepository.recordAccessEvent).toHaveBeenCalledWith(42, 'enabled');
  });

  it('records exactly one "regenerated" entry on regenerate', async () => {
    const enabled = await service.enable(42);
    auditRepository.recordAccessEvent.mockClear();

    await service.regenerate(42, enabled.version);

    expect(auditRepository.recordAccessEvent).toHaveBeenCalledTimes(1);
    expect(auditRepository.recordAccessEvent).toHaveBeenCalledWith(
      42,
      'regenerated',
    );
  });

  it('records exactly one "disabled" entry on disable', async () => {
    const enabled = await service.enable(42);
    auditRepository.recordAccessEvent.mockClear();

    await service.disable(42, enabled.version);

    expect(auditRepository.recordAccessEvent).toHaveBeenCalledTimes(1);
    expect(auditRepository.recordAccessEvent).toHaveBeenCalledWith(
      42,
      'disabled',
    );
  });

  it('does not record an entry for an idempotent no-op enable', async () => {
    const first = await service.enable(42);
    auditRepository.recordAccessEvent.mockClear();

    await service.enable(42, first.version);

    expect(auditRepository.recordAccessEvent).not.toHaveBeenCalled();
  });

  it('does not record an entry when a mutation fails on a stale version', async () => {
    const enabled = await service.enable(42);
    await service.regenerate(42, enabled.version);
    auditRepository.recordAccessEvent.mockClear();

    await expect(
      service.regenerate(42, enabled.version),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.disable(42, enabled.version)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(auditRepository.recordAccessEvent).not.toHaveBeenCalled();
  });

  it('retries a failing audit write and succeeds without logging an error', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const enabled = await service.enable(42);
    auditRepository.recordAccessEvent
      .mockClear()
      .mockRejectedValueOnce(new Error('transient 1'))
      .mockRejectedValueOnce(new Error('transient 2'))
      .mockResolvedValueOnce(undefined);

    await expect(
      service.regenerate(42, enabled.version),
    ).resolves.toMatchObject({ enabled: true });

    expect(auditRepository.recordAccessEvent).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs an error and does not fail the mutation when every audit attempt throws', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const enabled = await service.enable(42);
    auditRepository.recordAccessEvent
      .mockClear()
      .mockRejectedValue(new Error('db down'));

    await expect(service.disable(42, enabled.version)).resolves.toMatchObject({
      enabled: false,
    });

    expect(auditRepository.recordAccessEvent).toHaveBeenCalledTimes(3);
    expect(auditRepository.recordAccessEvent).toHaveBeenCalledWith(
      42,
      'disabled',
    );
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(repository.access).toMatchObject({ enabled: false, tokenHash: null });

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
