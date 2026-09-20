import { GuidanceMessageWriter } from './guidance-message-writer.service';
import { GuidanceResponse } from '../contracts';

describe('GuidanceMessageWriter', () => {
  function buildDb() {
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = jest.fn().mockReturnValue({ values });

    return { insert, values, onConflictDoUpdate };
  }

  const response: GuidanceResponse = {
    text: 'Missing an occasional dose is usually not dangerous.',
    citationIds: ['chunk-1'],
    validationStatus: 'accepted',
    promptVersion: 'v1',
  };

  it('inserts the right values for a normal write', async () => {
    const db = buildDb();
    const writer = new GuidanceMessageWriter(db as any);

    await writer.write(5, '2026-08-26', response);

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenCalledWith({
      scheduleTimeId: 5,
      date: '2026-08-26',
      text: response.text,
      citations: response.citationIds,
      validationStatus: response.validationStatus,
      safetyRunId: null,
    });
  });

  it('skips the insert entirely and does not throw when scheduleTimeId is null', async () => {
    const db = buildDb();
    const writer = new GuidanceMessageWriter(db as any);

    await expect(
      writer.write(null, '2026-08-26', response),
    ).resolves.toBeUndefined();

    expect(db.insert).not.toHaveBeenCalled();
  });

  it('updates rather than erroring on a duplicate (scheduleTimeId, date) — via onConflictDoUpdate, not a plain insert', async () => {
    const db = buildDb();
    const writer = new GuidanceMessageWriter(db as any);

    await writer.write(5, '2026-08-26', response);
    await writer.write(5, '2026-08-26', { ...response, text: 'updated text' });

    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.onConflictDoUpdate).toHaveBeenCalledTimes(2);
    expect(db.onConflictDoUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: expect.any(Array),
        set: expect.objectContaining({ text: 'updated text' }),
      }),
    );
  });
  it('replaces the cached safety run trace when retry produces exact-run guidance', async () => {
    const db = buildDb();
    const writer = new GuidanceMessageWriter(db as any);
    const safetyRunId = '11111111-1111-4111-8111-111111111111';

    await writer.write(5, '2026-08-26', response, null);
    await writer.write(5, '2026-08-26', response, safetyRunId);

    expect(db.onConflictDoUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ safetyRunId }),
      }),
    );
  });
});
