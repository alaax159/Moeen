import { FindingExplanationCacheRepository } from './finding-explanation-cache.repository';

function createSelectChain(resolvedRows: unknown[]) {
  const chain: Record<string, jest.Mock> = {};
  for (const method of ['from', 'where']) {
    chain[method] = jest.fn().mockReturnValue(chain);
  }
  chain.limit = jest.fn().mockResolvedValue(resolvedRows);
  return chain;
}

function createInsertChain() {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn().mockReturnValue(chain);
  chain.onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
  return chain;
}

describe('FindingExplanationCacheRepository', () => {
  describe('findByHash', () => {
    it('returns null when nothing is cached for the hash', async () => {
      const db = { select: jest.fn().mockReturnValue(createSelectChain([])) };
      const repo = new FindingExplanationCacheRepository(db as never);

      const result = await repo.findByHash('abc123');

      expect(result).toBeNull();
    });

    it('returns the cached row when present', async () => {
      const row = {
        text: 'Explanation text.',
        citations: ['label-chunk-1'],
        validationStatus: 'accepted' as const,
      };
      const db = {
        select: jest.fn().mockReturnValue(createSelectChain([row])),
      };
      const repo = new FindingExplanationCacheRepository(db as never);

      const result = await repo.findByHash('abc123');

      expect(result).toEqual(row);
    });
  });

  describe('save', () => {
    it('upserts on the finding hash so a second write for the same hash never duplicates a row', async () => {
      const insertChain = createInsertChain();
      const db = { insert: jest.fn().mockReturnValue(insertChain) };
      const repo = new FindingExplanationCacheRepository(db as never);

      await repo.save('abc123', {
        text: 'Explanation text.',
        citations: ['label-chunk-1'],
        validationStatus: 'accepted',
      });

      expect(db.insert).toHaveBeenCalledTimes(1);
      const [call] = insertChain.onConflictDoUpdate.mock.calls[0] as [
        { set: { text: string } },
      ];
      expect(call.set.text).toBe('Explanation text.');
    });
  });
});
