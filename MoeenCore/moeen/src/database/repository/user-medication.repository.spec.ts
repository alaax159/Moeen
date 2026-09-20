import { NotFoundException } from '@nestjs/common';

import { MedicationEventsService } from '../../medication-events/medication-events.service';
import {
  AddMedicationDto,
  DurationOption,
  MedicationSource,
} from '../../medications/dto/add-medication.dto';
import { UserMedicationRepository } from './user-medication.repository';

jest.mock(
  '../../medication-safety/invalidation/safety-invalidation.writer',
  () => ({
    enqueueSafetyInvalidation: jest.fn().mockResolvedValue({
      contextVersion: 1,
      queuedUserMedicationIds: [100],
    }),
  }),
);

function createChain(terminalMethod: string, resolvedValue: unknown) {
  const chain: Record<string, jest.Mock> = {};
  const methods = [
    'from',
    'where',
    'limit',
    'values',
    'onConflictDoNothing',
    'returning',
    'select',
    'insert',
  ];
  for (const method of methods) {
    chain[method] =
      method === terminalMethod
        ? jest.fn().mockResolvedValue(resolvedValue)
        : jest.fn().mockReturnValue(chain);
  }
  return chain;
}

function createDto(
  source: MedicationSource,
  medication: AddMedicationDto['medication'] = {},
): AddMedicationDto {
  return {
    source,
    medication,
    userMedication: {
      frequency: 1,
      dosageAmount: 10,
      dosageUnit: 'mg',
      dosageForm: 'tablet',
      durationOption: DurationOption.ONGOING,
    },
    scheduleTimes: [],
  };
}

describe('UserMedicationRepository — MedicationVerifiedEvent emission', () => {
  let medicationEvents: { emit: jest.Mock };

  beforeEach(() => {
    medicationEvents = { emit: jest.fn() };
  });

  function buildRepository(tx: unknown) {
    const db = {
      select: jest.fn().mockReturnValue(createChain('limit', [{ id: 9 }])), // getUserIdByFirebaseUid
      transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    return new UserMedicationRepository(
      db as never,
      medicationEvents as unknown as MedicationEventsService,
    );
  }

  it('EXISTING_DB: does not emit', async () => {
    const tx = {
      select: jest
        .fn()
        .mockReturnValueOnce(createChain('limit', [{ id: 5 }])) // resolveMedicationId's row lookup
        .mockReturnValue(createChain('limit', [{ id: 5 }])),
      insert: jest
        .fn()
        .mockReturnValue(createChain('returning', [{ id: 100 }])), // user_medication insert
    };
    const repository = buildRepository(tx);

    const result = await repository.insert_user_medication(
      createDto(MedicationSource.EXISTING_DB, { id: 5 }),
      {
        dailyMedId: null,
        scheduleTimes: [],
        startDate: '2026-01-01',
        endDate: null,
      },
      'firebase-uid',
    );

    expect(result.medicationId).toBe(5);
    expect(medicationEvents.emit).not.toHaveBeenCalled();
  });

  it('RXNORM: persists the supplied RxCUI on the medication row', async () => {
    const medicationInsertChain = createChain('returning', [{ id: 55 }]);
    const userMedicationInsertChain = createChain('returning', [{ id: 100 }]);

    const tx = {
      select: jest.fn(),
      insert: jest
        .fn()
        .mockReturnValueOnce(medicationInsertChain)
        .mockReturnValueOnce(userMedicationInsertChain),
    };

    const repository = buildRepository(tx);

    const result = await repository.insert_user_medication(
      createDto(MedicationSource.RXNORM, {
        genericName: 'Acetaminophen',
        rxcui: ' 161 ',
      }),
      {
        dailyMedId: null,
        scheduleTimes: [],
        startDate: '2026-01-01',
        endDate: null,
      },
      'firebase-uid',
    );

    expect(result.medicationId).toBe(55);

    expect(medicationInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        genericName: 'Acetaminophen',
        verificationSource: 'rxnorm',
        verificationStatus: 'verified',
        rxcui: '161',
      }),
    );

    expect(medicationEvents.emit).not.toHaveBeenCalled();
  });

  it('EXISTING_DB: preserves a stored RxCUI in the draft safety context', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(createChain('limit', [{ id: 9 }]))
        .mockReturnValueOnce(
          createChain('limit', [
            {
              id: 5,
              brandName: 'Tylenol',
              genericName: 'Acetaminophen',
              verificationSource: 'rxnorm',
              rxcui: '161',
            },
          ]),
        ),
    };

    const repository = new UserMedicationRepository(
      db as never,
      medicationEvents as unknown as MedicationEventsService,
    );

    const result = await repository.getDraftSafetyContext(
      createDto(MedicationSource.EXISTING_DB, { id: 5 }),
      'firebase-uid',
    );

    expect(db.select).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        rxcui: expect.anything(),
      }),
    );

    expect(result).toMatchObject({
      userId: 9,
      medicationId: 5,
      rxcui: '161',
      verificationSource: 'rxnorm',
      verificationStatus: 'verified',
    });
  });

  it('EXISTING_DB: throws NotFoundException when the medication row does not exist, still no emit', async () => {
    const tx = {
      select: jest.fn().mockReturnValue(createChain('limit', [])),
      insert: jest.fn(),
    };
    const repository = buildRepository(tx);

    await expect(
      repository.insert_user_medication(
        createDto(MedicationSource.EXISTING_DB, { id: 999 }),
        {
          dailyMedId: null,
          scheduleTimes: [],
          startDate: '2026-01-01',
          endDate: null,
        },
        'firebase-uid',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(medicationEvents.emit).not.toHaveBeenCalled();
  });

  it('DAILYMED, genuinely new medication: emits exactly once, with the dm/ prefix stripped', async () => {
    const tx = {
      select: jest.fn().mockReturnValue(createChain('limit', [])), // no existing row, either lookup
      insert: jest
        .fn()
        .mockReturnValueOnce(createChain('returning', [{ id: 42 }])) // medication insert (onConflictDoNothing -> returning)
        .mockReturnValueOnce(createChain('returning', [{ id: 100 }])), // user_medication insert
    };
    const repository = buildRepository(tx);

    const result = await repository.insert_user_medication(
      createDto(MedicationSource.DAILYMED, { dailymedId: 'setid-a' }),
      {
        dailyMedId: 'dm/setid-a',
        scheduleTimes: [],
        startDate: '2026-01-01',
        endDate: null,
      },
      'firebase-uid',
    );

    expect(result.medicationId).toBe(42);
    expect(medicationEvents.emit).toHaveBeenCalledTimes(1);
    expect(medicationEvents.emit).toHaveBeenCalledWith({
      medicationId: 42,
      dailyMedSetId: 'setid-a',
    });
  });

  it('DAILYMED, medication already exists: does not emit', async () => {
    const tx = {
      select: jest.fn().mockReturnValue(createChain('limit', [{ id: 42 }])), // existing row found immediately
      insert: jest
        .fn()
        .mockReturnValue(createChain('returning', [{ id: 100 }])), // user_medication insert
    };
    const repository = buildRepository(tx);

    const result = await repository.insert_user_medication(
      createDto(MedicationSource.DAILYMED, { dailymedId: 'setid-a' }),
      {
        dailyMedId: 'dm/setid-a',
        scheduleTimes: [],
        startDate: '2026-01-01',
        endDate: null,
      },
      'firebase-uid',
    );

    expect(result.medicationId).toBe(42);
    expect(medicationEvents.emit).not.toHaveBeenCalled();
  });

  it('DAILYMED, concurrent insert race (onConflictDoNothing inserted nothing): does not emit', async () => {
    const tx = {
      select: jest
        .fn()
        .mockReturnValueOnce(createChain('limit', [])) // first existing-check: not found yet
        .mockReturnValueOnce(createChain('limit', [{ id: 42 }])), // post-insert re-check: the concurrent writer's row
      insert: jest
        .fn()
        .mockReturnValueOnce(createChain('returning', [])) // onConflictDoNothing: nothing inserted
        .mockReturnValueOnce(createChain('returning', [{ id: 100 }])), // user_medication insert
    };
    const repository = buildRepository(tx);

    const result = await repository.insert_user_medication(
      createDto(MedicationSource.DAILYMED, { dailymedId: 'setid-a' }),
      {
        dailyMedId: 'dm/setid-a',
        scheduleTimes: [],
        startDate: '2026-01-01',
        endDate: null,
      },
      'firebase-uid',
    );

    expect(result.medicationId).toBe(42);
    expect(medicationEvents.emit).not.toHaveBeenCalled();
  });

  it('MANUAL: does not emit', async () => {
    const tx = {
      select: jest.fn(),
      insert: jest
        .fn()
        .mockReturnValueOnce(createChain('returning', [{ id: 7 }])) // manual medication insert
        .mockReturnValueOnce(createChain('returning', [{ id: 100 }])), // user_medication insert
    };
    const repository = buildRepository(tx);

    const result = await repository.insert_user_medication(
      createDto(MedicationSource.MANUAL, { genericName: 'aspirin' }),
      {
        dailyMedId: null,
        scheduleTimes: [],
        startDate: '2026-01-01',
        endDate: null,
      },
      'firebase-uid',
    );

    expect(result.medicationId).toBe(7);
    expect(medicationEvents.emit).not.toHaveBeenCalled();
  });

  it('the event is emitted after the transaction resolves, not from inside it', async () => {
    const callOrder: string[] = [];
    const tx = {
      select: jest.fn().mockReturnValue(createChain('limit', [])),
      insert: jest
        .fn()
        .mockReturnValueOnce(createChain('returning', [{ id: 42 }]))
        .mockReturnValueOnce(createChain('returning', [{ id: 100 }])),
    };
    medicationEvents.emit.mockImplementation(() => callOrder.push('emit'));

    const db = {
      select: jest.fn().mockReturnValue(createChain('limit', [{ id: 9 }])),
      transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const result = await callback(tx);
          callOrder.push('transaction-resolved');
          return result;
        },
      ),
    };
    const repository = new UserMedicationRepository(
      db as never,
      medicationEvents as unknown as MedicationEventsService,
    );

    await repository.insert_user_medication(
      createDto(MedicationSource.DAILYMED, { dailymedId: 'setid-a' }),
      {
        dailyMedId: 'dm/setid-a',
        scheduleTimes: [],
        startDate: '2026-01-01',
        endDate: null,
      },
      'firebase-uid',
    );

    expect(callOrder).toEqual(['transaction-resolved', 'emit']);
  });
});
