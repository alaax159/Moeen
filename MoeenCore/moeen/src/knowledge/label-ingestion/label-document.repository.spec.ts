import { LabelDocumentRepository } from './label-document.repository';

function createChainableMock(
  terminalMethod: string,
  resolvedValue: unknown,
  rows: { existing?: unknown[]; affectedUsers?: unknown[] } = {},
) {
  const chain: Record<string, jest.Mock> = {};
  const methods = [
    'from',
    'where',
    'values',
    'onConflictDoUpdate',
    'set',
    'delete',
    'insert',
    'select',
    'selectDistinct',
    'limit',
    'orderBy',
    'onConflictDoNothing',
  ];
  for (const method of methods) {
    chain[method] =
      method === terminalMethod
        ? jest.fn().mockResolvedValue(resolvedValue)
        : jest.fn().mockReturnValue(chain);
  }

  // Read terminals: .limit() ends the existing-label lookup, .orderBy() ends
  // the affected-patient lookup. Default to "nothing on record", which makes
  // the label look new without queueing any recheck.
  if (terminalMethod !== 'limit') {
    chain.limit = jest.fn().mockResolvedValue(rows.existing ?? []);
  }
  if (terminalMethod !== 'orderBy') {
    chain.orderBy = jest.fn().mockResolvedValue(rows.affectedUsers ?? []);
  }

  // The invalidation writer advances patient_safety_state via an upsert that
  // returns the new context version; without a row it treats the write as
  // failed and throws.
  chain.returning = jest.fn().mockResolvedValue([{ contextVersion: 1 }]);

  return chain;
}

describe('LabelDocumentRepository', () => {
  describe('recordFetched', () => {
    it('deletes any stale "unknown" placeholder row and upserts the real one, both inside one transaction', async () => {
      const tx = createChainableMock('onConflictDoUpdate', undefined);
      // delete(...).where(...) and insert(...).values(...).onConflictDoUpdate(...)
      // share the same chain object here, which is fine — we're asserting
      // both entry points (delete, insert) were called on the same tx.
      const db = {
        transaction: jest.fn((callback: (tx: unknown) => Promise<void>) =>
          callback(tx),
        ),
      };

      const repository = new LabelDocumentRepository(db as never);

      await repository.recordFetched({
        medicationId: 1,
        setId: 'setid-a',
        labelVersion: '13',
        rawContent: '<document/>',
      });

      expect(db.transaction).toHaveBeenCalledTimes(1);
      // the fix: a delete (clearing the 'unknown' placeholder) and an
      // insert (the real upsert) both happen inside the same transaction
      // callback, not as two separate top-level db calls.
      expect(tx.delete).toHaveBeenCalledTimes(1);
      expect(tx.insert).toHaveBeenCalledTimes(1);
      expect(tx.values).toHaveBeenCalledWith(
        expect.objectContaining({
          setId: 'setid-a',
          labelVersion: '13',
          fetchStatus: 'fetched',
          rawContent: '<document/>',
        }),
      );
    });

    // The storm guard. A label re-fetched with byte-identical content carries
    // no new interaction or contraindication data, so nobody is rechecked —
    // otherwise every routine re-ingestion of a widely-prescribed drug would
    // queue a recheck for every patient taking it.
    it('queues nothing when the label is re-fetched unchanged', async () => {
      const tx = createChainableMock('onConflictDoUpdate', undefined, {
        existing: [{ fetchStatus: 'fetched', rawContent: '<document/>' }],
        affectedUsers: [{ userId: 10 }, { userId: 11 }],
      });
      const db = {
        transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) =>
          callback(tx),
        ),
      };

      const result = await new LabelDocumentRepository(db as never).recordFetched({
        medicationId: 1,
        setId: 'setid-a',
        labelVersion: '13',
        rawContent: '<document/>',
      });

      expect(result).toEqual({ contentChanged: false, invalidatedUserIds: [] });
      // The label row is still written; only the recheck fan-out is skipped.
      expect(tx.insert).toHaveBeenCalledTimes(1);
      expect(tx.selectDistinct).not.toHaveBeenCalled();
    });

    it('queues a recheck for every active patient when the label content changes', async () => {
      const tx = createChainableMock('set', undefined, {
        existing: [{ fetchStatus: 'fetched', rawContent: '<old-document/>' }],
        affectedUsers: [{ userId: 10 }, { userId: 11 }],
      });
      const db = {
        transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) =>
          callback(tx),
        ),
      };

      const result = await new LabelDocumentRepository(db as never).recordFetched({
        medicationId: 1,
        setId: 'setid-a',
        labelVersion: '14',
        rawContent: '<new-document/>',
      });

      expect(result.contentChanged).toBe(true);
      expect(result.invalidatedUserIds).toEqual([10, 11]);
      expect(tx.selectDistinct).toHaveBeenCalledTimes(1);
    });

    it('treats a first successful fetch as changed, since the engine could not see this label before', async () => {
      const tx = createChainableMock('set', undefined, {
        existing: [],
        affectedUsers: [{ userId: 10 }],
      });
      const db = {
        transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) =>
          callback(tx),
        ),
      };

      const result = await new LabelDocumentRepository(db as never).recordFetched({
        medicationId: 1,
        setId: 'setid-a',
        labelVersion: '1',
        rawContent: '<document/>',
      });

      expect(result.contentChanged).toBe(true);
      expect(result.invalidatedUserIds).toEqual([10]);
    });

    it('regression: a metadata-fetch failure followed by success does not leave two rows for the same setid', async () => {
      // Simulates the real bug: recordFailed writes labelVersion='unknown'
      // (metadata never resolved), then a later attempt's recordFetched
      // writes the real version. Without the fix, these are two different
      // upsert keys — (setid,'unknown') and (setid,'13') — so recordFetched
      // alone would leave the stale row behind. The delete inside
      // recordFetched's transaction is what removes it.
      const tx = createChainableMock('onConflictDoUpdate', undefined);
      const db = {
        insert: jest
          .fn()
          .mockReturnValue(
            createChainableMock('onConflictDoUpdate', undefined),
          ),
        transaction: jest.fn((callback: (tx: unknown) => Promise<void>) =>
          callback(tx),
        ),
      };

      const repository = new LabelDocumentRepository(db as never);

      await repository.recordFailed({
        medicationId: 1,
        setId: 'setid-a',
        labelVersion: 'unknown',
        failureReason: 'DailyMed is down',
        retryCount: 0,
      });
      await repository.recordFetched({
        medicationId: 1,
        setId: 'setid-a',
        labelVersion: '13',
        rawContent: '<document/>',
      });

      // recordFailed goes straight to db.insert (no transaction needed —
      // nothing to clean up when we don't have a real version yet).
      expect(db.insert).toHaveBeenCalledTimes(1);
      // recordFetched's transaction issued exactly one delete — the
      // cleanup for the placeholder row recordFailed just wrote.
      expect(tx.delete).toHaveBeenCalledTimes(1);
      expect(tx.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe('recordFailed', () => {
    it('upserts directly on the db (no transaction — nothing to clean up yet)', async () => {
      const insertChain = createChainableMock('onConflictDoUpdate', undefined);
      const db = {
        insert: jest.fn().mockReturnValue(insertChain),
        transaction: jest.fn(),
      };

      const repository = new LabelDocumentRepository(db as never);

      await repository.recordFailed({
        medicationId: 1,
        setId: 'setid-a',
        labelVersion: 'unknown',
        failureReason: 'DailyMed is down',
        retryCount: 2,
      });

      expect(db.transaction).not.toHaveBeenCalled();
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          fetchStatus: 'failed',
          failureReason: 'DailyMed is down',
          retryCount: 2,
        }),
      );
    });
  });

  describe('findMedicationsNeedingIngestion', () => {
    it('maps rows to { medicationId, dailyMedId }', async () => {
      const rows = [
        { medicationId: 1, dailyMedId: 'dm/setid-a' },
        { medicationId: 2, dailyMedId: 'dm/setid-b' },
      ];
      const selectChain = createChainableMock('where', rows);
      const db = { select: jest.fn().mockReturnValue(selectChain) };

      const repository = new LabelDocumentRepository(db as never);

      const result = await repository.findMedicationsNeedingIngestion();

      expect(result).toEqual(rows);
    });
  });

  describe('findDocumentsNeedingEmbedding', () => {
    it('returns fetched documents selected by the profile reconciliation query', async () => {
      const rows = [{ medicationId: 1, setId: 'setid-a', labelVersion: '13' }];
      const selectChain = createChainableMock('where', rows);
      const db = { select: jest.fn().mockReturnValue(selectChain) };
      const repository = new LabelDocumentRepository(db as never);

      await expect(
        repository.findDocumentsNeedingEmbedding('deterministic-sha256', 'v1'),
      ).resolves.toEqual(rows);

      // Outer document query plus the no-chunk and mismatched-profile
      // correlated subqueries.
      expect(db.select).toHaveBeenCalledTimes(3);
    });
  });
});
