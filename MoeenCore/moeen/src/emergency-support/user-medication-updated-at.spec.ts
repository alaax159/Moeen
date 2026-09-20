import { getTableColumns } from 'drizzle-orm';

import { userMedication } from '../database/schema';
import { UserMedicationRepository } from '../database/repository/user-medication.repository';

function chainTo(method: string, result: unknown) {
  const chain: Record<string, jest.Mock> = {};
  for (const name of ['from', 'innerJoin', 'where', 'limit', 'returning']) {
    chain[name] =
      name === method
        ? jest.fn().mockResolvedValue(result)
        : jest.fn().mockReturnValue(chain);
  }
  return chain;
}

/**
 * These repository methods now queue a safety invalidation in the same
 * transaction, so the fake tx has to answer the writer's chain too:
 * an upsert on patient_safety_state that returns the new context version,
 * and a lookup of the patient's active medications.
 */
function safetyInvalidationInsert(): Record<string, jest.Mock> {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn().mockReturnValue(chain);
  chain.onConflictDoUpdate = jest.fn().mockReturnValue(chain);
  chain.onConflictDoNothing = jest.fn().mockResolvedValue(undefined);
  chain.returning = jest.fn().mockResolvedValue([{ contextVersion: 1 }]);
  return chain;
}

function noActiveMedications(): Record<string, jest.Mock> {
  const chain: Record<string, jest.Mock> = {};
  for (const name of ['from', 'where', 'orderBy']) {
    chain[name] =
      name === 'orderBy'
        ? jest.fn().mockResolvedValue([])
        : jest.fn().mockReturnValue(chain);
  }
  return chain;
}

function repositoryForUpdate(options: {
  dtoScheduleRows?: { time: string }[];
  capturedSets: Record<string, unknown>[];
}) {
  const current = {
    id: 9,
    userId: 42,
    status: 'active',
    completion: 'ongoing',
    startDate: '2026-01-01',
  };
  const updated = { id: 9 };
  const tx = {
    select: jest.fn(),
    update: jest.fn().mockImplementation(() => {
      const chain: Record<string, jest.Mock> = {};
      chain.set = jest.fn((values: Record<string, unknown>) => {
        options.capturedSets.push(values);
        return chain;
      });
      chain.where = jest.fn().mockResolvedValue([]);
      return chain;
    }),
    delete: jest.fn().mockReturnValue(chainTo('where', [])),
    insert: jest.fn().mockImplementation(() => safetyInvalidationInsert()),
  } as Record<string, jest.Mock>;

  const selectResults = options.dtoScheduleRows
    ? [
        chainTo('limit', [current]),
        chainTo('where', options.dtoScheduleRows),
        chainTo('where', [updated]),
        chainTo('where', []),
      ]
    : [
        chainTo('limit', [current]),
        chainTo('where', [updated]),
        chainTo('where', []),
      ];
  for (const result of selectResults) tx.select.mockReturnValueOnce(result);
  tx.select.mockReturnValue(noActiveMedications());
  tx.selectDistinct = jest.fn().mockReturnValue(noActiveMedications());

  const db = {
    select: jest.fn().mockReturnValue(chainTo('limit', [{ id: 42 }])),
    transaction: jest.fn((callback: (transaction: unknown) => unknown) =>
      callback(tx),
    ),
  };

  return new UserMedicationRepository(
    db as never,
    { emit: jest.fn() } as never,
  );
}

describe('UserMedicationRepository updatedAt maintenance', () => {
  it('gives new medications a non-null default updatedAt', () => {
    const column = getTableColumns(userMedication).updatedAt;

    expect(column.notNull).toBe(true);
    expect(column.hasDefault).toBe(true);
  });

  it.each([
    ['dose', { dosageAmount: 2 }, { dosageAmount: '2' }],
    ['frequency', { frequency: 3 }, { frequency: 3 }],
    [
      'instructions',
      { instructions: 'With food' },
      { instructions: 'With food' },
    ],
  ])('updates updatedAt when changing %s', async (_name, dto, expected) => {
    const capturedSets: Record<string, unknown>[] = [];
    const repository = repositoryForUpdate({ capturedSets });

    await repository.updateUserMedication(9, dto, 'firebase-user');

    expect(capturedSets).toHaveLength(1);
    expect(capturedSets[0]).toMatchObject(expected);
    expect(capturedSets[0].updatedAt).toBeInstanceOf(Date);
  });

  it('updates the parent updatedAt for a schedule-only change', async () => {
    const capturedSets: Record<string, unknown>[] = [];
    const repository = repositoryForUpdate({
      capturedSets,
      dtoScheduleRows: [{ time: '08:00:00' }],
    });

    await repository.updateUserMedication(
      9,
      { scheduleTimes: ['09:00:00'] },
      'firebase-user',
    );

    expect(capturedSets).toHaveLength(1);
    expect(capturedSets[0].updatedAt).toBeInstanceOf(Date);
  });

  it('updates updatedAt when archiving a medication', async () => {
    let archivedValues: Record<string, unknown> | undefined;
    const updateChain: Record<string, jest.Mock> = {};
    updateChain.set = jest.fn((values: Record<string, unknown>) => {
      archivedValues = values;
      return updateChain;
    });
    updateChain.where = jest.fn().mockReturnValue(updateChain);
    updateChain.returning = jest.fn().mockResolvedValue([{ id: 9 }]);
    const tx = {
      update: jest.fn().mockReturnValue(updateChain),
      insert: jest.fn().mockImplementation(() => safetyInvalidationInsert()),
      select: jest.fn().mockReturnValue(noActiveMedications()),
      selectDistinct: jest.fn().mockReturnValue(noActiveMedications()),
    };
    const db = {
      select: jest.fn().mockReturnValue(chainTo('limit', [{ id: 42 }])),
      update: jest.fn().mockReturnValue(updateChain),
      transaction: jest.fn((callback: (transaction: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const repository = new UserMedicationRepository(
      db as never,
      { emit: jest.fn() } as never,
    );

    await repository.archiveUserMedication(9, 'firebase-user');

    expect(archivedValues).toMatchObject({ status: 'archived' });
    expect(archivedValues?.updatedAt).toBeInstanceOf(Date);
  });
});
