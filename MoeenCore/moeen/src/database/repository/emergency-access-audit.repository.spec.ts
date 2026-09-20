import * as schema from '../schema';
import { EmergencyAccessAuditRepository } from './emergency-access-audit.repository';

describe('EmergencyAccessAuditRepository', () => {
  function buildDb() {
    const values = jest.fn().mockResolvedValue(undefined);
    const insert = jest.fn().mockReturnValue({ values });
    return { insert, values };
  }

  it('appends one row with the given userId and action', async () => {
    const db = buildDb();
    const repository = new EmergencyAccessAuditRepository(db as never);

    await repository.recordAccessEvent(7, 'disabled');

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledWith(schema.emergencyAccessAudit);
    expect(db.values).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenCalledWith({ userId: 7, action: 'disabled' });
  });

  it('does not batch across calls — one insert per event', async () => {
    const db = buildDb();
    const repository = new EmergencyAccessAuditRepository(db as never);

    await repository.recordAccessEvent(1, 'enabled');
    await repository.recordAccessEvent(1, 'regenerated');

    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.values).toHaveBeenNthCalledWith(1, {
      userId: 1,
      action: 'enabled',
    });
    expect(db.values).toHaveBeenNthCalledWith(2, {
      userId: 1,
      action: 'regenerated',
    });
  });

  it('leaves created_at to the database default', async () => {
    const db = buildDb();
    const repository = new EmergencyAccessAuditRepository(db as never);

    await repository.recordAccessEvent(3, 'enabled');

    expect(db.values).toHaveBeenCalledWith(
      expect.not.objectContaining({ createdAt: expect.anything() }),
    );
  });
});
