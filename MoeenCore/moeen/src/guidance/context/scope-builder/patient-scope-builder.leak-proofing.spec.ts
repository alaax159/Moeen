import { MockSafetyResultAdapter } from '../../__fixtures__/mock-safety-result-adapter';
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

const FORBIDDEN_STRINGS = [
  'Jane Patient',
  'jane.patient@example.com',
  '1990-05-14',
];

/**
 * The real SQL queries only ever SELECT the specific columns
 * PatientScope allows — this suite is defense in depth, not the primary
 * safeguard. It proves that even if a row handed back by the database
 * layer carried extra PII-shaped fields (a future column, a query someone
 * widens by mistake), the builder's additive object construction — never
 * `{ ...row }`, always named fields — would still not let them through.
 */
describe('PatientScopeBuilder — leak-proofing', () => {
  it('a patient record seeded with name, email, and date of birth produces a scope containing none of those strings', async () => {
    const db = {
      select: jest
        .fn()
        // medications: row carries PII fields no real query selects
        .mockReturnValueOnce(
          createChain([
            {
              userMedicationId: 1,
              genericName: 'lisinopril',
              frequency: 1,
              time: '08:00:00',
              // the following should never have been selected in the
              // first place, and must not survive into the output either
              patientName: 'Jane Patient',
              email: 'jane.patient@example.com',
              dateOfBirth: '1990-05-14',
            },
          ]),
        )
        .mockReturnValueOnce(
          createChain([
            {
              name: 'Hypertension',
              externalId: '38341003',
              patientName: 'Jane Patient',
            },
          ]),
        )
        .mockReturnValueOnce(
          createChain([
            {
              name: 'Penicillin',
              externalId: null,
              email: 'jane.patient@example.com',
            },
          ]),
        ),
    };
    const builder = new PatientScopeBuilder(
      db as never,
      new MockSafetyResultAdapter(),
    );

    const scope = await builder.buildScope({ patientId: 42 });
    const serialized = JSON.stringify(scope);

    for (const forbidden of FORBIDDEN_STRINGS) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('an unknown extra column on the patient record does not surface in the scope', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(
          createChain([
            {
              userMedicationId: 1,
              genericName: 'aspirin',
              frequency: 1,
              time: '08:00:00',
              someFutureColumnNobodyExpected: 'leaked-value-should-not-appear',
            },
          ]),
        )
        .mockReturnValueOnce(createChain([]))
        .mockReturnValueOnce(createChain([])),
    };
    const builder = new PatientScopeBuilder(
      db as never,
      new MockSafetyResultAdapter(),
    );

    const scope = await builder.buildScope({ patientId: 42 });
    const serialized = JSON.stringify(scope);

    expect(serialized).not.toContain('leaked-value-should-not-appear');
    expect(serialized).not.toContain('someFutureColumnNobodyExpected');
    // and the medication itself still came through correctly — the extra
    // column was ignored, not treated as a reason to drop the whole row
    expect(scope.medications).toEqual([
      { ingredientName: 'aspirin', frequency: 1, scheduleSlots: ['08:00:00'] },
    ]);
  });

  it('the scope never carries a patient id anywhere on it, including the top-level object itself', async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce(createChain([]))
        .mockReturnValueOnce(createChain([]))
        .mockReturnValueOnce(createChain([])),
    };
    const builder = new PatientScopeBuilder(
      db as never,
      new MockSafetyResultAdapter(),
    );

    const scope = await builder.buildScope({ patientId: 42 });

    expect(scope).not.toHaveProperty('patientId');
    expect(scope).not.toHaveProperty('id');
    expect(JSON.stringify(scope)).not.toContain('42');
  });
});
