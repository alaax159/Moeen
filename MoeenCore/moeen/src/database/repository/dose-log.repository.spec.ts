import { DoseLogRepository } from './dose-log.repository';

describe('DoseLogRepository today dose status mapping', () => {
  it('should expose unresolved doses as upcoming and preserve missed doses', async () => {
    const rows = [
      {
        id: 10,
        frequency: 3,
        dosageAmount: '1',
        dosageUnit: 'tablet',
        dosageForm: 'tablet',
        instructions: null,
        brandName: 'Test Medication',
        genericName: null,
        scheduleTimeId: 100,
        time: '12:00:00',
        doseLogStatus: 'pending',
        snoozeCount: 0,
      },
      {
        id: 10,
        frequency: 3,
        dosageAmount: '1',
        dosageUnit: 'tablet',
        dosageForm: 'tablet',
        instructions: null,
        brandName: 'Test Medication',
        genericName: null,
        scheduleTimeId: 101,
        time: '11:00:00',
        doseLogStatus: 'missed',
        snoozeCount: 0,
      },
      {
        id: 10,
        frequency: 3,
        dosageAmount: '1',
        dosageUnit: 'tablet',
        dosageForm: 'tablet',
        instructions: null,
        brandName: 'Test Medication',
        genericName: null,
        scheduleTimeId: 102,
        time: '10:00:00',
        doseLogStatus: null,
        snoozeCount: null,
      },
    ];

    const query = {
      from: jest.fn(),
      innerJoin: jest.fn(),
      leftJoin: jest.fn(),
      where: jest.fn(),
    };

    query.from.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.leftJoin.mockReturnValue(query);
    query.where.mockResolvedValue(rows);

    const db = {
      select: jest.fn().mockReturnValue(query),
    };

    const repository = new DoseLogRepository(db as never);

    const testableRepository = repository as unknown as {
      getUserIdByFirebaseUid: jest.Mock;
      getTodayDateInPalestine: jest.Mock;
    };

    testableRepository.getUserIdByFirebaseUid = jest.fn().mockResolvedValue(1);

    testableRepository.getTodayDateInPalestine = jest
      .fn()
      .mockReturnValue('2026-08-16');

    const result = await repository.getTodayMedications('firebase-user');

    expect(result).toHaveLength(1);

    expect(result[0].todaySchedule).toEqual([
      {
        scheduleTimeId: 100,
        time: '12:00:00',
        status: 'upcoming',
        snoozeCount: 0,
      },
      {
        scheduleTimeId: 101,
        time: '11:00:00',
        status: 'missed',
        snoozeCount: 0,
      },
      {
        scheduleTimeId: 102,
        time: '10:00:00',
        status: 'upcoming',
        snoozeCount: 0,
      },
    ]);

    expect(result[0].summary).toEqual({
      taken: 0,
      upcoming: 2,
      missed: 1,
      skipped: 0,
    });
  });
});

describe('DoseLogRepository missed-dose transition', () => {
  function createRepository(
    returningRows: Array<{ userMedicationId: number }>,
  ) {
    const updateQuery = {
      set: jest.fn(),
      where: jest.fn(),
      returning: jest.fn().mockResolvedValue(returningRows),
    };

    updateQuery.set.mockReturnValue(updateQuery);
    updateQuery.where.mockReturnValue(updateQuery);

    const db = {
      update: jest.fn().mockReturnValue(updateQuery),
    };

    return {
      repository: new DoseLogRepository(db as never),
      db,
      updateQuery,
    };
  }

  it('returns the user medication id when a pending dose is marked missed', async () => {
    const { repository, db, updateQuery } = createRepository([
      { userMedicationId: 77 },
    ]);

    const result = await repository.markDoseMissedIfPending(42);

    expect(result).toBe(77);
    expect(db.update).toHaveBeenCalledTimes(1);
    const anyDate: unknown = expect.any(Date);

    expect(updateQuery.set).toHaveBeenCalledWith({
      status: 'missed',
      markedAt: anyDate,
    });
    expect(updateQuery.returning).toHaveBeenCalledTimes(1);
  });

  it('returns null when no pending dose was updated', async () => {
    const { repository } = createRepository([]);

    const result = await repository.markDoseMissedIfPending(42);

    expect(result).toBeNull();
  });
});

describe('DoseLogRepository dose lookup', () => {
  function createRepository(rows: { userMedicationId: number }[]) {
    const query = {
      from: jest.fn(),
      where: jest.fn(),
      limit: jest.fn().mockResolvedValue(rows),
    };

    query.from.mockReturnValue(query);
    query.where.mockReturnValue(query);

    const db = {
      select: jest.fn().mockReturnValue(query),
    };

    return {
      repository: new DoseLogRepository(db as never),
      db,
      query,
    };
  }

  it('returns the user medication id for an existing dose log', async () => {
    const { repository } = createRepository([{ userMedicationId: 77 }]);

    const result = await repository.getDoseLogUserMedicationId(42);

    expect(result).toBe(77);
  });

  it('returns null when the dose log does not exist', async () => {
    const { repository } = createRepository([]);

    const result = await repository.getDoseLogUserMedicationId(42);

    expect(result).toBeNull();
  });
});

describe('DoseLogRepository.getDoseNotifiedAt', () => {
  function createRepository(rows: { notifiedAt: Date | null }[]) {
    const query = {
      from: jest.fn(),
      where: jest.fn(),
      limit: jest.fn().mockResolvedValue(rows),
    };

    query.from.mockReturnValue(query);
    query.where.mockReturnValue(query);

    const db = {
      select: jest.fn().mockReturnValue(query),
    };

    return { repository: new DoseLogRepository(db as never) };
  }

  it('returns the stored notifiedAt when the dose log has been notified', async () => {
    const notifiedAt = new Date('2026-08-30T10:00:00.000Z');
    const { repository } = createRepository([{ notifiedAt }]);

    const result = await repository.getDoseNotifiedAt(42);

    expect(result).toBe(notifiedAt);
  });

  it('returns null when notifiedAt has never been set', async () => {
    const { repository } = createRepository([{ notifiedAt: null }]);

    const result = await repository.getDoseNotifiedAt(42);

    expect(result).toBeNull();
  });

  it('returns null when the dose log does not exist', async () => {
    const { repository } = createRepository([]);

    const result = await repository.getDoseNotifiedAt(42);

    expect(result).toBeNull();
  });
});

describe('DoseLogRepository.getMedicationDisplayInfo', () => {
  function createRepository(
    rows: {
      brandName: string | null;
      genericName: string | null;
      dosageAmount: string;
      dosageUnit: string;
    }[],
  ) {
    const query = {
      from: jest.fn(),
      innerJoin: jest.fn(),
      where: jest.fn(),
      limit: jest.fn().mockResolvedValue(rows),
    };

    query.from.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.where.mockReturnValue(query);

    const db = {
      select: jest.fn().mockReturnValue(query),
    };

    return { repository: new DoseLogRepository(db as never) };
  }

  it('returns the joined medication display info when found', async () => {
    const { repository } = createRepository([
      {
        brandName: 'Zestril',
        genericName: 'lisinopril',
        dosageAmount: '10',
        dosageUnit: 'mg',
      },
    ]);

    const result = await repository.getMedicationDisplayInfo(10);

    expect(result).toEqual({
      brandName: 'Zestril',
      genericName: 'lisinopril',
      dosageAmount: '10',
      dosageUnit: 'mg',
    });
  });

  it('returns null when no matching userMedication/medication row exists', async () => {
    const { repository } = createRepository([]);

    const result = await repository.getMedicationDisplayInfo(999);

    expect(result).toBeNull();
  });
});

describe('DoseLogRepository.getRecentDoseLogsByUserId', () => {
  function createRepository(rows: unknown[]) {
    const query = {
      from: jest.fn(),
      innerJoin: jest.fn(),
      where: jest.fn(),
      orderBy: jest.fn().mockResolvedValue(rows),
    };

    query.from.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.where.mockReturnValue(query);

    const db = { select: jest.fn().mockReturnValue(query) };

    return { repository: new DoseLogRepository(db as never), db, query };
  }

  it('selects, joins twice, filters and orders newest-first', async () => {
    const rows = [
      {
        userMedicationId: 11,
        brandName: 'Zestril',
        genericName: 'lisinopril',
        date: '2026-09-05',
        scheduledFor: new Date('2026-09-05T05:00:00.000Z'),
        status: 'taken',
        markedAt: new Date('2026-09-05T05:03:00.000Z'),
      },
    ];
    const { repository, db, query } = createRepository(rows);

    const result = await repository.getRecentDoseLogsByUserId(42);

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(query.innerJoin).toHaveBeenCalledTimes(2);
    expect(query.where).toHaveBeenCalledTimes(1);
    expect(query.orderBy).toHaveBeenCalledTimes(1);
    expect(result).toBe(rows);
  });

  it('returns an empty array when the user has no recent doses', async () => {
    const { repository } = createRepository([]);

    expect(await repository.getRecentDoseLogsByUserId(42)).toEqual([]);
  });

  it('bounds date to [today - 13 .. today] so pre-generated future doses are excluded', async () => {
    const { repository, query } = createRepository([]);
    jest
      .spyOn(
        repository as unknown as { getTodayDateInPalestine: () => string },
        'getTodayDateInPalestine',
      )
      .mockReturnValue('2026-09-06');

    await repository.getRecentDoseLogsByUserId(42);

    const whereArg = query.where.mock.calls[0][0] as unknown;
    const seen = new WeakSet<object>();
    const sql = JSON.stringify(whereArg, (_key, value: unknown) => {
      if (typeof value === 'function') return undefined;
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return undefined;
        seen.add(value);
      }
      return value;
    });

    // lower bound: 2026-09-06 minus (RECENT_DOSE_LOG_WINDOW_DAYS - 1) days
    expect(sql).toContain(' >= ');
    expect(sql).toContain('2026-08-24');
    // upper bound: today — a dose dated after today (scheduler pre-generates
    // these) must not appear in a "recent history" export.
    expect(sql).toContain(' <= ');
    expect(sql).toContain('2026-09-06');
  });
});
