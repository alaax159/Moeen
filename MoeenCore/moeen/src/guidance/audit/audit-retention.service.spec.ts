import { AuditRetentionService } from './audit-retention.service';

describe('AuditRetentionService', () => {
  function buildDb() {
    const where = jest.fn().mockResolvedValue(undefined);
    const deleteFn = jest.fn().mockReturnValue({ where });
    const execute = jest.fn().mockResolvedValue(undefined);

    const tx = { execute, delete: deleteFn };

    const transaction = jest.fn(async (callback: (fakeTx: typeof tx) => Promise<void>) => {
      await callback(tx);
    });

    return { transaction, execute, delete: deleteFn, where };
  }

  it('sets the retention_purge session flag before running the delete, inside the same transaction', async () => {
    const db = buildDb();
    const service = new AuditRetentionService(db as any);

    await service.purgeExpiredAuditLogs();

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(db.delete).toHaveBeenCalledTimes(1);

    // Ordering matters: the append-only trigger checks the session flag at
    // DELETE time, so the flag must be set before delete() runs, not after.
    const executeOrder = db.execute.mock.invocationCallOrder[0];
    const deleteOrder = db.delete.mock.invocationCallOrder[0];
    expect(executeOrder).toBeLessThan(deleteOrder);
  });

  it('accepts a configurable retention window instead of always using the 2-year placeholder default', async () => {
    const db = buildDb();
    const service = new AuditRetentionService(db as any);

    await service.purgeExpiredAuditLogs(30);

    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(db.where).toHaveBeenCalledTimes(1);
  });

  // Honest limitation, the same one already disclosed for DrizzleAuditWriter's
  // append-only guarantee (DL-4 T1): a fake db object has no unique-constraint
  // or trigger enforcement at all. The real guarantee this service depends on
  // — that a DELETE without SET LOCAL audit_log.retention_purge = 'on' is
  // rejected — lives entirely in drizzle/0001_audit_log_append_only.sql's
  // trigger, and can only be proven by running that migration against a real
  // Postgres instance and attempting an unflagged DELETE. The two tests above
  // only prove this service issues the flag-then-delete sequence the trigger
  // requires; neither one exercises the trigger itself.
});
