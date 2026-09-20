import {
  LabelChunkRepository,
  LabelChunkToPersist,
} from './label-chunk.repository';

describe('LabelChunkRepository', () => {
  const chunk: LabelChunkToPersist = {
    medicationId: 7,
    setId: 'setid-a',
    labelVersion: '13',
    section: 'warnings',
    ordinal: 0,
    text: 'Warning text.',
    embedding: Array.from({ length: 1536 }, (_, index) =>
      index === 0 ? 1 : 0,
    ),
    embeddingModel: 'deterministic-sha256',
    embeddingVersion: 'v1',
    tokenCount: 3,
  };

  function buildDb() {
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = jest.fn().mockReturnValue({ values });
    const where = jest.fn().mockResolvedValue(undefined);
    const deleteFrom = jest.fn().mockReturnValue({ where });
    const tx = { insert, delete: deleteFrom };
    const transaction = jest.fn(
      (callback: (executor: typeof tx) => Promise<void>) => callback(tx),
    );
    return {
      db: { transaction },
      tx,
      values,
      onConflictDoUpdate,
      where,
      transaction,
    };
  }

  it('upserts every chunk and trims leftovers in one transaction', async () => {
    const fakes = buildDb();
    const repository = new LabelChunkRepository(fakes.db as never);

    await repository.replaceAll('setid-a', '13', [chunk]);

    expect(fakes.transaction).toHaveBeenCalledTimes(1);
    expect(fakes.tx.insert).toHaveBeenCalledTimes(1);
    expect(fakes.values).toHaveBeenCalledWith(chunk);
    expect(fakes.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          embeddingModel: chunk.embeddingModel,
          embeddingVersion: chunk.embeddingVersion,
        }),
      }),
    );
    expect(fakes.tx.delete).toHaveBeenCalledTimes(1);
    expect(fakes.where).toHaveBeenCalledTimes(1);
  });

  it('still deletes all old chunks atomically when processing yields none', async () => {
    const fakes = buildDb();
    const repository = new LabelChunkRepository(fakes.db as never);

    await repository.replaceAll('setid-a', '13', []);

    expect(fakes.transaction).toHaveBeenCalledTimes(1);
    expect(fakes.tx.insert).not.toHaveBeenCalled();
    expect(fakes.tx.delete).toHaveBeenCalledTimes(1);
  });
});
