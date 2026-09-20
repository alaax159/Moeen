import type { MedicationSafetyRunDraft } from '../medication-safety.contracts';
import { MedicationSafetyRunRepository } from './medication-safety-run.repository';

describe('MedicationSafetyRunRepository invariants', () => {
  const context = {
    userId: 7,
    contextVersion: 3,
    subjectUserMedicationId: 42,
    activeUserMedicationIds: [42, 43],
    activeUserAllergyIds: [8],
    activeUserConditionIds: [9],
    activeMedications: [],
    activeAllergies: [],
    activeConditions: [],
  };

  function draft(): MedicationSafetyRunDraft {
    const now = new Date('2026-08-31T12:00:00.000Z');
    return {
      subjectUserMedicationId: 42,
      trigger: 'medication_added',
      idempotencyKey: 'add:42',
      engineVersion: 'test',
      context,
      contextHash: 'hash',
      startedAt: now,
      completedAt: now,
      requiredChecks: ['drug_drug'],
      outcome: 'findings',
      coverageStatus: 'complete',
      checkerResults: [
        {
          checkerType: 'drug_drug',
          status: 'verified',
          datasetVersions: {},
          evidence: [],
          checkedAt: now,
          warnings: [
            {
              warningType: 'drug_drug',
              severity: 'major',
              message: 'Interaction.',
              subjectUserMedicationIds: [42, 43],
            },
          ],
        },
      ],
    };
  }

  it('hashes the minimized context deterministically', () => {
    const repository = new MedicationSafetyRunRepository({} as never);

    expect(repository.hashContext(context)).toBe(
      repository.hashContext({ ...context }),
    );
    expect(
      repository.hashContext({ ...context, activeUserAllergyIds: [] }),
    ).not.toBe(repository.hashContext(context));
  });

  it('rejects cross-patient medication ids before opening a transaction', async () => {
    const db = { transaction: jest.fn() };
    const repository = new MedicationSafetyRunRepository(db as never);
    const input = draft();
    input.checkerResults[0].warnings[0].subjectUserMedicationIds = [42, 999];

    await expect(repository.persistRun(input)).rejects.toThrow(
      'outside the captured patient context',
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects cross-patient allergy and condition references', async () => {
    const db = { transaction: jest.fn() };
    const repository = new MedicationSafetyRunRepository(db as never);
    const allergyInput = draft();
    allergyInput.checkerResults[0].warnings[0].subjectUserAllergyId = 999;

    await expect(repository.persistRun(allergyInput)).rejects.toThrow(
      'allergy is outside',
    );

    const conditionInput = draft();
    conditionInput.checkerResults[0].warnings[0].subjectUserConditionId = 999;
    await expect(repository.persistRun(conditionInput)).rejects.toThrow(
      'condition is outside',
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
