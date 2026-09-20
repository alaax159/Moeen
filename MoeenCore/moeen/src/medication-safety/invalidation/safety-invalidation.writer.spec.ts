import { enqueueSafetyInvalidation } from './safety-invalidation.writer';

function chainTo(terminal: string, result: unknown) {
  const chain: Record<string, jest.Mock> = {};
  for (const method of [
    'values',
    'onConflictDoUpdate',
    'onConflictDoNothing',
    'returning',
    'from',
    'where',
    'orderBy',
  ]) {
    chain[method] =
      method === terminal
        ? jest.fn().mockResolvedValue(result)
        : jest.fn().mockReturnValue(chain);
  }
  return chain;
}

describe('enqueueSafetyInvalidation', () => {
  it('advances the context fence and queues every active medication', async () => {
    const stateInsert = chainTo('returning', [{ contextVersion: 4 }]);
    const outboxInsert = chainTo('onConflictDoNothing', undefined);
    const activeMedicationSelect = chainTo('orderBy', [{ id: 10 }, { id: 11 }]);
    const tx = {
      insert: jest
        .fn()
        .mockReturnValueOnce(stateInsert)
        .mockReturnValueOnce(outboxInsert),
      select: jest.fn().mockReturnValue(activeMedicationSelect),
    };

    await expect(
      enqueueSafetyInvalidation(tx as never, {
        userId: 7,
        trigger: 'allergy_updated',
        sourceKey: 'user-allergy:8:saved',
      }),
    ).resolves.toEqual({
      contextVersion: 4,
      queuedUserMedicationIds: [10, 11],
    });

    const queuedValues = outboxInsert.values.mock.calls[0][0];
    expect(queuedValues).toEqual([
      expect.objectContaining({
        userId: 7,
        subjectUserMedicationId: 10,
        trigger: 'allergy_updated',
        contextVersion: 4,
      }),
      expect.objectContaining({
        userId: 7,
        subjectUserMedicationId: 11,
        trigger: 'allergy_updated',
        contextVersion: 4,
      }),
    ]);
    expect(queuedValues[0].idempotencyKey).not.toContain('user-allergy');
    expect(queuedValues[0].payload.sourceKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it('still advances the fence when the patient has no active medication', async () => {
    const tx = {
      insert: jest
        .fn()
        .mockReturnValue(chainTo('returning', [{ contextVersion: 2 }])),
      select: jest.fn().mockReturnValue(chainTo('orderBy', [])),
    };

    await expect(
      enqueueSafetyInvalidation(tx as never, {
        userId: 7,
        trigger: 'medication_archived',
        sourceKey: 'user-medication:10:archived',
      }),
    ).resolves.toEqual({
      contextVersion: 2,
      queuedUserMedicationIds: [],
    });
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });
});
