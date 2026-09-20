import { PgDialect } from 'drizzle-orm/pg-core';

import { HealthProfileRepository } from '../database/repository/health-profile.repository';
import { UserMedicationRepository } from '../database/repository/user-medication.repository';

type SqlExpression = { getSQL(): Parameters<PgDialect['sqlToQuery']>[0] };

function compileWhere(where: SqlExpression) {
  return new PgDialect().sqlToQuery(where.getSQL());
}

function healthDatabaseCapture() {
  let capturedWhere: SqlExpression | undefined;
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn().mockReturnValue(chain);
  chain.innerJoin = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn((where: SqlExpression) => {
    capturedWhere = where;
    return Promise.resolve([]);
  });

  return {
    db: { select: jest.fn().mockReturnValue(chain) },
    where: () => {
      if (!capturedWhere) throw new Error('Expected a where predicate');
      return compileWhere(capturedWhere);
    },
  };
}

function medicationDatabaseCapture() {
  let capturedWhere: SqlExpression | undefined;
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn().mockReturnValue(chain);
  chain.innerJoin = jest.fn().mockReturnValue(chain);
  chain.leftJoin = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn((where: SqlExpression) => {
    capturedWhere = where;
    return chain;
  });
  chain.orderBy = jest.fn().mockResolvedValue([]);

  return {
    db: { select: jest.fn().mockReturnValue(chain) },
    where: () => {
      if (!capturedWhere) throw new Error('Expected a where predicate');
      return compileWhere(capturedWhere);
    },
  };
}

describe('Emergency Medical Card repository filters', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-06T22:30:00Z'));
  });
  afterEach(() => jest.useRealTimers());
  it('excludes inactive allergies with the actual repository predicate', async () => {
    const capture = healthDatabaseCapture();
    const repository = new HealthProfileRepository(capture.db as never);

    await repository.getEmergencyCardActiveAllergiesByUserId(42);

    const query = capture.where();
    expect(query.sql).toContain('"user_allergies"."is_active" = $2');
    expect(query.params).toEqual([42, true]);
  });

  it('excludes inactive chronic conditions with the actual repository predicate', async () => {
    const capture = healthDatabaseCapture();
    const repository = new HealthProfileRepository(capture.db as never);

    await repository.getActiveChronicConditionsByUserId(42);

    const query = capture.where();
    expect(query.sql).toContain('"user_chronic_conditions"."is_active" = $2');
    expect(query.params).toEqual([42, true]);
  });

  it.each([
    ['archived medication', 'archived'],
    ['completed medication', 'completed'],
    ['cancelled medication', 'cancelled'],
  ])(
    'excludes a %s with the actual repository predicate',
    async (_case, excluded) => {
      const capture = medicationDatabaseCapture();
      const repository = new UserMedicationRepository(
        capture.db as never,
        { emit: jest.fn() } as never,
      );

      await repository.getCurrentMedicationsByUserId(42);

      const { params } = capture.where();
      expect(capture.where().sql).toContain('"user_medication"."status" = $2');
      expect(capture.where().sql).toContain(
        '"user_medication"."completion" = $3',
      );
      expect(params).toEqual([
        42,
        'active',
        'ongoing',
        '2026-09-07',
        '2026-09-07',
      ]);
      expect(params).not.toContain(excluded);
    },
  );

  it('includes only active and ongoing medications', async () => {
    const capture = medicationDatabaseCapture();
    const repository = new UserMedicationRepository(
      capture.db as never,
      { emit: jest.fn() } as never,
    );

    await repository.getCurrentMedicationsByUserId(42);

    const query = capture.where();
    expect(query.sql).toContain('"user_medication"."status" = $2');
    expect(query.sql).toContain('"user_medication"."completion" = $3');
    expect(query.params).toEqual([
      42,
      'active',
      'ongoing',
      '2026-09-07',
      '2026-09-07',
    ]);
  });
  it('uses local treatment dates for the actual drug-interaction medication query', async () => {
    const capture = medicationDatabaseCapture();
    const repository = new UserMedicationRepository(
      capture.db as never,
      { emit: jest.fn() } as never,
    );
    await repository.getActiveMedicationsByUserId(42);
    const query = capture.where();
    // At 22:30 UTC it is already September 7 locally. Exclude September 2
    // Epinephrine and future starts; include today and open-ended courses.
    expect(query.sql).toContain('"user_medication"."start_date" <= $4');
    expect(query.sql).toContain(
      '("user_medication"."end_date" is null or "user_medication"."end_date" >= $5)',
    );
    expect(query.params).toEqual([
      42,
      'active',
      'ongoing',
      '2026-09-07',
      '2026-09-07',
    ]);
  });

  it('applies the same date window to the Active list used by active-interactions', async () => {
    const capture = medicationDatabaseCapture();
    const repository = new UserMedicationRepository(
      capture.db as never,
      { emit: jest.fn() } as never,
    );
    jest.spyOn(repository, 'getUserIdByFirebaseUid').mockResolvedValue(42);
    await repository.getUserMedications('test-user', 'active');
    const query = capture.where();
    expect(query.sql).toContain('"user_medication"."start_date" <=');
    expect(query.sql).toContain(
      '"user_medication"."end_date" is null or "user_medication"."end_date" >=',
    );
    expect(query.params).toEqual([
      42,
      42,
      'active',
      'ongoing',
      '2026-09-07',
      '2026-09-07',
    ]);
  });
});
