import * as schema from '../../database/schema';
import { syncSafetyWarningProjection } from './safety-warning-projection';

describe('syncSafetyWarningProjection', () => {
  const checkedAt = new Date('2026-09-02T06:00:00.000Z');

  function build(currentWarnings: object[]) {
    const orderBy = jest.fn().mockResolvedValue(currentWarnings);
    const selectWhere = jest.fn(() => ({ orderBy }));
    const innerJoin = jest.fn(() => ({ where: selectWhere }));
    const from = jest.fn(() => ({ innerJoin }));
    const select = jest.fn(() => ({ from }));

    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn(() => ({ where: updateWhere }));
    const update = jest.fn(() => ({ set }));

    const values = jest.fn().mockResolvedValue(undefined);
    const insert = jest.fn(() => ({ values }));

    return {
      tx: { select, update, insert },
      select,
      update,
      set,
      insert,
      values,
    };
  }

  it('rebuilds active legacy warnings from every authoritative current finding', async () => {
    const currentWarnings = [
      {
        warningType: 'drug_allergy' as const,
        severity: 'major' as const,
        message: 'Allergy conflict.',
        findingKey: 'allergy-key',
      },
      {
        warningType: 'duplicate_therapy' as const,
        severity: 'moderate' as const,
        message: 'Duplicate therapy.',
        findingKey: 'duplicate-key',
      },
    ];
    const { tx, select, update, set, insert, values } = build(currentWarnings);

    await syncSafetyWarningProjection(tx as never, 42, checkedAt);

    expect(select).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(schema.medicationSafetyWarning);
    expect(set).toHaveBeenCalledWith({ isActive: false, checkedAt });
    expect(insert).toHaveBeenCalledWith(schema.medicationSafetyWarning);
    expect(values).toHaveBeenCalledWith([
      {
        userMedicationId: 42,
        warningType: 'drug_allergy',
        severity: 'major',
        message: 'Allergy conflict.',
        isActive: true,
        checkedAt,
      },
      {
        userMedicationId: 42,
        warningType: 'duplicate_therapy',
        severity: 'moderate',
        message: 'Duplicate therapy.',
        isActive: true,
        checkedAt,
      },
    ]);
  });

  it('only deactivates legacy rows when no current findings remain', async () => {
    const { tx, update, insert } = build([]);

    await syncSafetyWarningProjection(tx as never, 42, checkedAt);

    expect(update).toHaveBeenCalledWith(schema.medicationSafetyWarning);
    expect(insert).not.toHaveBeenCalled();
  });
});
