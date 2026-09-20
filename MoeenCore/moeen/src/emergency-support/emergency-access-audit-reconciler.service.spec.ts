import { Logger } from '@nestjs/common';

import { EmergencyAccessAuditReconcilerService } from './emergency-access-audit-reconciler.service';

describe('EmergencyAccessAuditReconcilerService', () => {
  function buildDb(rows: unknown[]) {
    const groupBy = jest.fn().mockResolvedValue(rows);
    const leftJoin = jest.fn().mockReturnValue({ groupBy });
    const from = jest.fn().mockReturnValue({ leftJoin });
    const select = jest.fn().mockReturnValue({ from });
    return { select, from, leftJoin, groupBy };
  }

  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs no warning when every record reconciles (count === version - baseline)', async () => {
    const db = buildDb([
      { userId: 1, version: 1, baseline: 0, auditCount: 1 },
      { userId: 2, version: 4, baseline: 2, auditCount: 2 },
      { userId: 3, version: 3, baseline: 3, auditCount: 0 },
    ]);
    const service = new EmergencyAccessAuditReconcilerService(db as never);

    await service.reconcileAuditCounts();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('3 record(s), 0 mismatch(es)'),
    );
  });

  it('warns per mismatched record with userId, actual and expected counts', async () => {
    const db = buildDb([
      { userId: 7, version: 5, baseline: 1, auditCount: 2 }, // expected 4
      { userId: 8, version: 2, baseline: 0, auditCount: 2 }, // ok
    ]);
    const service = new EmergencyAccessAuditReconcilerService(db as never);

    await service.reconcileAuditCounts();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('userId=7'));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('actual=2 expected=4'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('2 record(s), 1 mismatch(es)'),
    );
  });

  it('coerces a string count from the driver before comparing', async () => {
    const db = buildDb([
      { userId: 9, version: 1, baseline: 0, auditCount: '1' },
    ]);
    const service = new EmergencyAccessAuditReconcilerService(db as never);

    await service.reconcileAuditCounts();

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
