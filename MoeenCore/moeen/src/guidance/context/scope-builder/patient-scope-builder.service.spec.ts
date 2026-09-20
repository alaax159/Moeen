import { MockSafetyResultAdapter } from '../../__fixtures__/mock-safety-result-adapter';
import { safetyCheckResultFixtures } from '../../__fixtures__/safety-check-results.fixture';
import { PatientScopeBuilder } from './patient-scope-builder.service';

function createChain(resolvedValue: unknown) {
  const chain: Record<string, jest.Mock> = {};
  for (const method of ['from', 'innerJoin', 'leftJoin', 'where']) {
    chain[method] =
      method === 'where'
        ? jest.fn().mockResolvedValue(resolvedValue)
        : jest.fn().mockReturnValue(chain);
  }
  return chain;
}

// db.select() is called three times per buildScope call, in this fixed
// order (medications, conditions, allergies) — Promise.all evaluates its
// array synchronously in order before awaiting, so mockReturnValueOnce
// chained in this order reliably matches each query.
function mockDb(
  medicationRows: unknown[],
  conditionRows: unknown[],
  allergyRows: unknown[],
) {
  return {
    select: jest
      .fn()
      .mockReturnValueOnce(createChain(medicationRows))
      .mockReturnValueOnce(createChain(conditionRows))
      .mockReturnValueOnce(createChain(allergyRows)),
  };
}

describe('PatientScopeBuilder', () => {
  let safetyResultPort: MockSafetyResultAdapter;

  beforeEach(() => {
    safetyResultPort = new MockSafetyResultAdapter();
  });

  it('builds ingredient names, frequency, and grouped schedule slots per medication', async () => {
    const db = mockDb(
      [
        {
          userMedicationId: 1,
          genericName: 'lisinopril',
          frequency: 1,
          time: '08:00:00',
        },
      ],
      [],
      [],
    );
    const builder = new PatientScopeBuilder(db as never, safetyResultPort);

    const scope = await builder.buildScope({ patientId: 42 });

    expect(scope.medications).toEqual([
      {
        ingredientName: 'lisinopril',
        frequency: 1,
        scheduleSlots: ['08:00:00'],
      },
    ]);
  });

  it('groups multiple schedule_time rows for the same medication into one scheduleSlots array', async () => {
    const db = mockDb(
      [
        {
          userMedicationId: 1,
          genericName: 'metformin',
          frequency: 2,
          time: '08:00:00',
        },
        {
          userMedicationId: 1,
          genericName: 'metformin',
          frequency: 2,
          time: '20:00:00',
        },
      ],
      [],
      [],
    );
    const builder = new PatientScopeBuilder(db as never, safetyResultPort);

    const scope = await builder.buildScope({ patientId: 42 });

    expect(scope.medications).toEqual([
      {
        ingredientName: 'metformin',
        frequency: 2,
        scheduleSlots: ['08:00:00', '20:00:00'],
      },
    ]);
  });

  it('skips a medication with no generic name rather than falling back to the brand name', async () => {
    const db = mockDb(
      [
        {
          userMedicationId: 1,
          genericName: null,
          frequency: 1,
          time: '08:00:00',
        },
      ],
      [],
      [],
    );
    const builder = new PatientScopeBuilder(db as never, safetyResultPort);

    const scope = await builder.buildScope({ patientId: 42 });

    expect(scope.medications).toEqual([]);
  });

  it('maps condition and allergy rows to { code, name }, using externalId as code', async () => {
    const db = mockDb(
      [],
      [{ name: 'Hypertension', externalId: '38341003' }],
      [{ name: 'Penicillin', externalId: null }],
    );
    const builder = new PatientScopeBuilder(db as never, safetyResultPort);

    const scope = await builder.buildScope({ patientId: 42 });

    expect(scope.conditions).toEqual([
      { code: '38341003', name: 'Hypertension' },
    ]);
    expect(scope.allergies).toEqual([{ code: null, name: 'Penicillin' }]);
  });

  it('includes findings from the SafetyResultPort', async () => {
    safetyResultPort.setResult(safetyCheckResultFixtures.moderateInteraction);
    const db = mockDb([], [], []);
    const builder = new PatientScopeBuilder(db as never, safetyResultPort);

    const scope = await builder.buildScope({ patientId: 42 });

    expect(scope.findings).toEqual(
      safetyCheckResultFixtures.moderateInteraction.findings,
    );
    expect(scope.safetySeverity).toBe(
      safetyCheckResultFixtures.moderateInteraction.severity,
    );
  });

  it('carries subjectMedicationId through when given, and omits it entirely when not', async () => {
    const builderWith = new PatientScopeBuilder(
      mockDb([], [], []) as never,
      safetyResultPort,
    );
    const withSubject = await builderWith.buildScope({
      patientId: 42,
      subjectMedicationId: 101,
    });
    expect(withSubject.subjectMedicationId).toBe(101);

    const builderWithout = new PatientScopeBuilder(
      mockDb([], [], []) as never,
      safetyResultPort,
    );
    const withoutSubject = await builderWithout.buildScope({ patientId: 42 });
    expect('subjectMedicationId' in withoutSubject).toBe(false);
  });

  it('narrows findings to the exact current finding when subjectSafetyCheckId is given', async () => {
    const findingId = '77777777-7777-4777-8777-777777777777';
    safetyResultPort.setResult(safetyCheckResultFixtures.mixedHighestWins);
    safetyResultPort.registerById(
      findingId,
      safetyCheckResultFixtures.majorAllergyConflict,
    );
    const findingSpy = jest.spyOn(safetyResultPort, 'getFindingById');
    const builder = new PatientScopeBuilder(
      mockDb([], [], []) as never,
      safetyResultPort,
    );

    const scope = await builder.buildScope({
      patientId: safetyCheckResultFixtures.majorAllergyConflict.patientId,
      subjectSafetyCheckId: findingId,
    });

    expect(scope.findings).toEqual(
      safetyCheckResultFixtures.majorAllergyConflict.findings,
    );
    expect(scope.safetySeverity).toBe(
      safetyCheckResultFixtures.majorAllergyConflict.severity,
    );
    expect(scope.findings).not.toEqual(
      safetyCheckResultFixtures.mixedHighestWins.findings,
    );
    expect(findingSpy).toHaveBeenCalledWith(
      findingId,
      safetyCheckResultFixtures.majorAllergyConflict.patientId,
    );
  });

  it('throws rather than silently widening when subjectSafetyCheckId does not resolve', async () => {
    const builder = new PatientScopeBuilder(
      mockDb([], [], []) as never,
      safetyResultPort,
    );

    await expect(
      builder.buildScope({ patientId: 42, subjectSafetyCheckId: '999' }),
    ).rejects.toThrow(/no safety finding found/i);
  });

  it('throws when subjectSafetyCheckId is not a valid UUID', async () => {
    const builder = new PatientScopeBuilder(
      mockDb([], [], []) as never,
      safetyResultPort,
    );

    await expect(
      builder.buildScope({
        patientId: 42,
        subjectSafetyCheckId: 'not-a-number',
      }),
    ).rejects.toThrow(/no safety finding found/i);
  });

  it("throws rather than leaking another patient's finding when the resolved check belongs to someone else", async () => {
    const findingId = '77777777-7777-4777-8777-777777777777';
    safetyResultPort.registerById(
      findingId,
      safetyCheckResultFixtures.majorAllergyConflict, // patientId 1003
    );
    const builder = new PatientScopeBuilder(
      mockDb([], [], []) as never,
      safetyResultPort,
    );

    await expect(
      builder.buildScope({ patientId: 42, subjectSafetyCheckId: findingId }),
    ).rejects.toThrow(/no safety finding found/i);
  });

  it('loads the exact current safety run instead of silently using latest', async () => {
    const exact = safetyCheckResultFixtures.moderateInteraction;
    safetyResultPort.setResult(exact);
    const currentRunSpy = jest.spyOn(
      safetyResultPort,
      'getCurrentRunForPatient',
    );
    const latestSpy = jest.spyOn(safetyResultPort, 'getLatestForPatient');
    const builder = new PatientScopeBuilder(
      mockDb([], [], []) as never,
      safetyResultPort,
    );

    const scope = await builder.buildScope({
      patientId: exact.patientId,
      safetyRunId: exact.runId,
    });

    expect(scope.safetyRunId).toBe(exact.runId);
    expect(currentRunSpy).toHaveBeenCalledWith(exact.patientId, exact.runId);
    expect(latestSpy).not.toHaveBeenCalled();
  });

  it('uses explicit unverified safety when a run was attempted but unavailable', async () => {
    const unverifiedSpy = jest.spyOn(
      safetyResultPort,
      'getUnverifiedForPatient',
    );
    const latestSpy = jest.spyOn(safetyResultPort, 'getLatestForPatient');
    const builder = new PatientScopeBuilder(
      mockDb([], [], []) as never,
      safetyResultPort,
    );

    const scope = await builder.buildScope({
      patientId: 42,
      safetyRunId: null,
    });

    expect(scope.safetySeverity).toBe('unverified');
    expect(scope.safetyCoverage.status).toBe('partial');
    expect(unverifiedSpy).toHaveBeenCalledWith(42);
    expect(latestSpy).not.toHaveBeenCalled();
  });

  it('loads the latest current run for the requested medication', async () => {
    safetyResultPort.setResult({
      ...safetyCheckResultFixtures.moderateInteraction,
      subjectUserMedicationId: 101,
    });
    const medicationSpy = jest.spyOn(
      safetyResultPort,
      'getLatestForMedication',
    );
    const latestSpy = jest.spyOn(safetyResultPort, 'getLatestForPatient');
    const builder = new PatientScopeBuilder(
      mockDb([], [], []) as never,
      safetyResultPort,
    );

    const scope = await builder.buildScope({
      patientId: safetyCheckResultFixtures.moderateInteraction.patientId,
      subjectMedicationId: 101,
    });

    expect(scope.safetySeverity).toBe(
      safetyCheckResultFixtures.moderateInteraction.severity,
    );
    expect(medicationSpy).toHaveBeenCalledWith(
      safetyCheckResultFixtures.moderateInteraction.patientId,
      101,
    );
    expect(latestSpy).not.toHaveBeenCalled();
  });

  it('rejects an exact run bound to a different subject medication', async () => {
    const exact = {
      ...safetyCheckResultFixtures.moderateInteraction,
      subjectUserMedicationId: 101,
    };
    safetyResultPort.setResult(exact);
    const builder = new PatientScopeBuilder(
      mockDb([], [], []) as never,
      safetyResultPort,
    );

    await expect(
      builder.buildScope({
        patientId: exact.patientId,
        subjectMedicationId: 999,
        safetyRunId: exact.runId,
      }),
    ).rejects.toThrow(/does not match medication 999/i);
  });

  it('rejects requests that select both a finding and a run', async () => {
    const builder = new PatientScopeBuilder(
      mockDb([], [], []) as never,
      safetyResultPort,
    );

    await expect(
      builder.buildScope({
        patientId: 42,
        subjectSafetyCheckId: '77777777-7777-4777-8777-777777777777',
        safetyRunId: '88888888-8888-4888-8888-888888888888',
      }),
    ).rejects.toThrow(/cannot select both/i);
  });

  it('never caches: two calls each re-run all three queries', async () => {
    const db = mockDb([], [], []);
    const builder = new PatientScopeBuilder(db as never, safetyResultPort);

    await builder.buildScope({ patientId: 42 });
    // db.select was consumed via mockReturnValueOnce x3 for the first call;
    // a second call needs three more, proving nothing was memoized.
    db.select
      .mockReturnValueOnce(createChain([]))
      .mockReturnValueOnce(createChain([]))
      .mockReturnValueOnce(createChain([]));
    await builder.buildScope({ patientId: 42 });

    expect(db.select).toHaveBeenCalledTimes(6);
  });
});
