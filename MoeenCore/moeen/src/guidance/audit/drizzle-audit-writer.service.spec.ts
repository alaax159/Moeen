import { DrizzleAuditWriter } from './drizzle-audit-writer.service';
import { RedactionFailedError } from '../context/redactor/redaction-failed.error';
import { GuidanceRequest } from '../contracts';

describe('DrizzleAuditWriter', () => {
  function buildDb() {
    const values = jest.fn().mockResolvedValue(undefined);
    const insert = jest.fn().mockReturnValue({ values });
    return { insert, values };
  }

  const request: GuidanceRequest = { patientId: 1, intent: 'missed_dose' };

  it('inserts exactly one row per call, with no batching across calls', async () => {
    const db = buildDb();
    const writer = new DrizzleAuditWriter(db as any);

    await writer.record({
      request,
      trigger: 'missed_dose_job',
      outcome: 'success',
      validationStatus: 'accepted',
    });
    await writer.record({
      request,
      trigger: 'missed_dose_job',
      outcome: 'success',
      validationStatus: 'accepted',
    });

    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.values).toHaveBeenCalledTimes(2);
  });

  it('marks redactionStatus as ok on success', async () => {
    const db = buildDb();
    const writer = new DrizzleAuditWriter(db as any);

    await writer.record({
      request,
      trigger: 'missed_dose_job',
      outcome: 'success',
      validationStatus: 'accepted',
    });

    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ redactionStatus: 'ok' }),
    );
  });

  it('marks redactionStatus as aborted only when failure.cause is a real RedactionFailedError instance', async () => {
    const db = buildDb();
    const writer = new DrizzleAuditWriter(db as any);

    await writer.record({
      request,
      trigger: 'missed_dose_job',
      outcome: 'failure',
      failure: {
        stage: 'call',
        message: 'cannot guarantee redaction',
        cause: new RedactionFailedError('cannot guarantee redaction'),
      },
    });

    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ redactionStatus: 'aborted' }),
    );
  });

  it('marks redactionStatus as ok for a call-stage failure whose cause is not a RedactionFailedError', async () => {
    const db = buildDb();
    const writer = new DrizzleAuditWriter(db as any);

    await writer.record({
      request,
      trigger: 'missed_dose_job',
      outcome: 'failure',
      failure: {
        stage: 'call',
        message: 'provider timed out',
        cause: new Error('provider timed out'),
      },
    });

    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ redactionStatus: 'ok' }),
    );
  });

  it('marks redactionStatus as ok for a failure at a different stage entirely', async () => {
    const db = buildDb();
    const writer = new DrizzleAuditWriter(db as any);

    await writer.record({
      request,
      trigger: 'missed_dose_job',
      outcome: 'failure',
      failure: {
        stage: 'retrieve',
        message: 'vector index unavailable',
        cause: new Error('vector index unavailable'),
      },
    });

    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ redactionStatus: 'ok' }),
    );
  });

  it('always writes null tokensIn/tokensOut — no usage source on current main', async () => {
    const db = buildDb();
    const writer = new DrizzleAuditWriter(db as any);

    await writer.record({
      request,
      trigger: 'missed_dose_job',
      outcome: 'success',
      validationStatus: 'accepted',
    });

    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ tokensIn: null, tokensOut: null }),
    );
  });

  it('stores the exact safety run id used by the guidance request', async () => {
    const db = buildDb();
    const writer = new DrizzleAuditWriter(db as any);
    const safetyRunId = '11111111-1111-4111-8111-111111111111';

    await writer.record({
      request: { ...request, safetyRunId },
      trigger: 'missed_dose_job',
      outcome: 'success',
      validationStatus: 'accepted',
    });

    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({ safetyRunId }),
    );
  });

  it('stores no trace of PII seeded into the request, even though field selection already makes it structurally impossible', async () => {
    const db = buildDb();
    const writer = new DrizzleAuditWriter(db as any);

    const seededName = 'Jane Q. Patientson';
    const seededEmail = 'jane.patientson@example.com';
    const piiRequest: GuidanceRequest = {
      patientId: 1,
      intent: 'medication_question',
      question: `My name is ${seededName} and my email is ${seededEmail}, is this normal?`,
    };

    await writer.record({
      request: piiRequest,
      trigger: 'patient_chat',
      outcome: 'success',
      validationStatus: 'accepted',
    });

    const storedRow = db.values.mock.calls[0][0];
    const serializedRow = JSON.stringify(storedRow);

    expect(serializedRow).not.toContain(seededName);
    expect(serializedRow).not.toContain(seededEmail);
    expect(serializedRow).not.toContain('jane.patientson');
    expect(serializedRow).not.toContain('Jane');
  });
});
