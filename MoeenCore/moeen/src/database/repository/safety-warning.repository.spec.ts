import * as schema from '../schema';
import { SafetyWarningRepository } from './safety-warning.repository';

type UpdateValues = { isActive: boolean; checkedAt: Date };

type InsertWarning = {
  userMedicationId: number;
  warningType: 'drug_drug' | 'drug_allergy' | 'drug_condition';
  severity: string;
  message: string;
  affected: string | null;
  isActive: boolean;
  checkedAt: Date;
};

type CheckUpsert = {
  values: { userMedicationId: number; status: string; checkedAt: Date | null };
  set: { status: string; checkedAt?: Date };
};

describe('SafetyWarningRepository', () => {
  let repository: SafetyWarningRepository;

  let capturedUpdateValues: UpdateValues | undefined;
  let capturedInsertValues: InsertWarning[] | undefined;
  let capturedCheckUpsert: CheckUpsert | undefined;
  let lockedForUpdate: boolean;

  const updateWhere = jest.fn().mockResolvedValue(undefined);
  const updateSet = jest.fn((values: UpdateValues) => {
    capturedUpdateValues = values;
    return { where: updateWhere };
  });
  const update = jest.fn(() => ({ set: updateSet }));

  const selectFor = jest.fn(() => {
    lockedForUpdate = true;
    return Promise.resolve([{ id: 42 }]);
  });
  const select = jest.fn(() => ({
    from: () => ({ where: () => ({ for: selectFor }) }),
  }));

  const insert = jest.fn((table: unknown) => ({
    values: (values: unknown) => {
      if (table === schema.medicationSafetyWarning) {
        capturedInsertValues = values as InsertWarning[];
        return Promise.resolve();
      }
      // medication_safety_check upsert
      return {
        onConflictDoUpdate: ({ set }: { set: CheckUpsert['set'] }) => {
          capturedCheckUpsert = {
            values: values as CheckUpsert['values'],
            set,
          };
          return Promise.resolve();
        },
      };
    },
  }));

  const transaction = jest.fn(
    async (callback: (tx: unknown) => Promise<void>) => {
      await callback({ select, update, insert });
    },
  );

  beforeEach(() => {
    jest.clearAllMocks();
    capturedUpdateValues = undefined;
    capturedInsertValues = undefined;
    capturedCheckUpsert = undefined;
    lockedForUpdate = false;
    updateWhere.mockResolvedValue(undefined);

    repository = new SafetyWarningRepository({ transaction } as never);
  });

  describe('replaceActiveWarnings', () => {
    it('locks the medication row, deactivates old warnings, inserts the latest, and records a checked status', async () => {
      await repository.replaceActiveWarnings(42, [
        {
          warningType: 'drug_allergy',
          severity: 'high',
          message: 'Allergy warning',
          affected: 'Penicillin allergy',
        },
        {
          warningType: 'drug_condition',
          severity: 'moderate',
          message: 'Condition warning',
        },
      ]);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(lockedForUpdate).toBe(true);

      expect(update).toHaveBeenCalledWith(schema.medicationSafetyWarning);
      expect(capturedUpdateValues?.isActive).toBe(false);
      expect(capturedUpdateValues?.checkedAt).toBeInstanceOf(Date);

      const checkedAt = capturedUpdateValues!.checkedAt;

      expect(insert).toHaveBeenCalledWith(schema.medicationSafetyWarning);
      expect(capturedInsertValues).toEqual([
        {
          userMedicationId: 42,
          warningType: 'drug_allergy',
          severity: 'high',
          message: 'Allergy warning',
          affected: 'Penicillin allergy',
          isActive: true,
          checkedAt,
        },
        {
          userMedicationId: 42,
          warningType: 'drug_condition',
          severity: 'moderate',
          message: 'Condition warning',
          affected: null,
          isActive: true,
          checkedAt,
        },
      ]);

      expect(insert).toHaveBeenCalledWith(schema.medicationSafetyCheck);
      expect(capturedCheckUpsert?.values).toEqual({
        userMedicationId: 42,
        status: 'checked',
        checkedAt,
      });
      expect(capturedCheckUpsert?.set).toEqual({ status: 'checked', checkedAt });
    });

    it('still records a checked status when there are no warnings to insert', async () => {
      await repository.replaceActiveWarnings(42, []);

      expect(capturedUpdateValues?.isActive).toBe(false);
      expect(insert).not.toHaveBeenCalledWith(schema.medicationSafetyWarning);
      expect(capturedInsertValues).toBeUndefined();

      expect(insert).toHaveBeenCalledWith(schema.medicationSafetyCheck);
      expect(capturedCheckUpsert?.values.status).toBe('checked');
    });
  });

  describe('recordFailedCheck', () => {
    it('locks the row and upserts a failed status without touching checked_at or warnings', async () => {
      await repository.recordFailedCheck(42);

      expect(lockedForUpdate).toBe(true);
      expect(update).not.toHaveBeenCalled();
      expect(insert).toHaveBeenCalledWith(schema.medicationSafetyCheck);
      expect(insert).not.toHaveBeenCalledWith(schema.medicationSafetyWarning);
      expect(capturedCheckUpsert?.values).toEqual({
        userMedicationId: 42,
        status: 'failed',
        checkedAt: null,
      });
      expect(capturedCheckUpsert?.set).toEqual({ status: 'failed' });
    });
  });
});
