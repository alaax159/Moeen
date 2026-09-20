import { MissedDoseGuidanceTrigger } from './missed-dose-guidance-trigger.service';
import { GuidanceMessageWriter } from './guidance-message-writer.service';
import { GuidanceResponse } from '../contracts';

describe('MissedDoseGuidanceTrigger + GuidanceMessageWriter (end-to-end)', () => {
  function buildFakeDb() {
    const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = jest.fn().mockReturnValue({ values });

    return { insert, values, onConflictDoUpdate };
  }

  const response: GuidanceResponse = {
    text: 'Missing an occasional dose is usually not dangerous, but check with your pharmacist if you are unsure.',
    citationIds: ['chunk-warfarin-01'],
    validationStatus: 'accepted',
    promptVersion: 'v1',
  };

  // Only the true external boundaries are faked: the orchestrator (a real
  // model call) and the dose_log lookup (a real DB query). GuidanceMessageWriter
  // is the real class, constructed with a fake db — proving the real wiring
  // between the two classes, not two independently mocked halves.
  function buildTrigger(db: ReturnType<typeof buildFakeDb>) {
    const orchestrator = { run: jest.fn().mockResolvedValue(response) };
    const doseLogRepository = {
      findMissedDoseGuidanceSubject: jest.fn().mockResolvedValue({
        patientId: 7,
        subjectMedicationId: 42,
        scheduleTimeId: 5,
      }),
    };

    const guidanceMessageWriter = new GuidanceMessageWriter(db as any);
    const trigger = new MissedDoseGuidanceTrigger(
      orchestrator as any,
      doseLogRepository as any,
      guidanceMessageWriter,
    );

    return { trigger, orchestrator, doseLogRepository };
  }

  it('trigger(doseLogId) results in exactly one real insert-chain call with the correct fields', async () => {
    const db = buildFakeDb();
    const { trigger } = buildTrigger(db);

    await trigger.trigger(99, '11111111-1111-4111-8111-111111111111');

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenCalledWith({
      scheduleTimeId: 5,
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      text: response.text,
      citations: response.citationIds,
      validationStatus: response.validationStatus,
      safetyRunId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('a second trigger(doseLogId) call goes through onConflictDoUpdate, not a raw duplicate insert', async () => {
    const db = buildFakeDb();
    const { trigger } = buildTrigger(db);

    await trigger.trigger(99);
    await trigger.trigger(99);

    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.onConflictDoUpdate).toHaveBeenCalledTimes(2);
    expect(db.onConflictDoUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: expect.any(Array),
        set: expect.objectContaining({
          text: response.text,
          citations: response.citationIds,
          validationStatus: response.validationStatus,
          safetyRunId: null,
        }),
      }),
    );
  });
});
