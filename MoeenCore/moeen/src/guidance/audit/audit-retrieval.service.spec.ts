import { AuditRetrievalService } from './audit-retrieval.service';

describe('AuditRetrievalService', () => {
  function buildDb(rows: unknown[]) {
    const orderBy = jest.fn().mockResolvedValue(rows);
    const where = jest.fn().mockReturnValue({ orderBy });
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });

    return { select, from, where, orderBy };
  }

  it('filters on the patient and the date range, ordered by createdAt', async () => {
    const rows = [{ id: 1, userId: 7, createdAt: new Date('2026-08-01T00:00:00.000Z') }];
    const db = buildDb(rows);
    const service = new AuditRetrievalService(db as any);

    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-08-31T23:59:59.999Z');
    const result = await service.findForPatientInRange(7, from, to);

    expect(result).toEqual(rows);
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.where).toHaveBeenCalledTimes(1);
    expect(db.orderBy).toHaveBeenCalledTimes(1);
  });
});
