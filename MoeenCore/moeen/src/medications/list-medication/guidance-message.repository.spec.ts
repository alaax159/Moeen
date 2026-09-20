import { GuidanceMessageRepository } from './guidance-message.repository';

describe('GuidanceMessageRepository', () => {
  function buildDb(rows: unknown[]) {
    const limit = jest.fn().mockResolvedValue(rows);
    const where = jest.fn().mockReturnValue({ limit });
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });
    const insert = jest.fn();
    const update = jest.fn();

    return { select, from, where, limit, insert, update };
  }

  it('returns null when nothing is cached for that (scheduleTimeId, date)', async () => {
    const db = buildDb([]);
    const repository = new GuidanceMessageRepository(db as any);

    const result = await repository.findForScheduleTimeToday(42, '2026-08-25');

    expect(result).toBeNull();
  });

  it('returns the real row when one exists', async () => {
    const cachedRow = {
      text: 'Missing an occasional dose is usually not dangerous, but check with your pharmacist if you are unsure.',
      citations: ['chunk-warfarin-01'],
      validationStatus: 'accepted' as const,
    };
    const db = buildDb([cachedRow]);
    const repository = new GuidanceMessageRepository(db as any);

    const result = await repository.findForScheduleTimeToday(42, '2026-08-25');

    expect(result).toEqual(cachedRow);
  });

  it('never performs a write — this is what "never triggers generation" actually means', async () => {
    const db = buildDb([]);
    const repository = new GuidanceMessageRepository(db as any);

    await repository.findForScheduleTimeToday(42, '2026-08-25');

    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});
