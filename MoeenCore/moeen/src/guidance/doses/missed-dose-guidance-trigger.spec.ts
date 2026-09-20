import { MissedDoseGuidanceTrigger } from './missed-dose-guidance-trigger.service';

describe('MissedDoseGuidanceTrigger', () => {
  it('runs the orchestrator once with the right patient and medication', async () => {
    const response = {
      text: 'ok',
      citationIds: [],
      validationStatus: 'accepted' as const,
      promptVersion: 'v1',
    };
    const orchestrator = { run: jest.fn().mockResolvedValue(response) };
    const doseLogRepository = {
      findMissedDoseGuidanceSubject: jest.fn().mockResolvedValue({
        patientId: 7,
        subjectMedicationId: 42,
        scheduleTimeId: 5,
      }),
    };
    const guidanceMessageWriter = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    await new MissedDoseGuidanceTrigger(
      orchestrator as any,
      doseLogRepository as any,
      guidanceMessageWriter as any,
    ).trigger(99, 'run-123');

    expect(orchestrator.run).toHaveBeenCalledTimes(1);
    expect(orchestrator.run).toHaveBeenCalledWith(
      {
        patientId: 7,
        intent: 'missed_dose',
        safetyRunId: 'run-123',
        subjectMedicationId: 42,
      },
      'missed_dose_job',
    );
    expect(guidanceMessageWriter.write).toHaveBeenCalledWith(
      5,
      expect.any(String),
      response,
      'run-123',
    );
  });

  it('rethrows an orchestrator failure so the durable job can retry', async () => {
    const orchestrator = {
      run: jest.fn().mockRejectedValue(new Error('provider down')),
    };
    const doseLogRepository = {
      findMissedDoseGuidanceSubject: jest.fn().mockResolvedValue({
        patientId: 7,
        subjectMedicationId: 42,
        scheduleTimeId: 5,
      }),
    };
    const guidanceMessageWriter = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      new MissedDoseGuidanceTrigger(
        orchestrator as any,
        doseLogRepository as any,
        guidanceMessageWriter as any,
      ).trigger(99),
    ).rejects.toThrow('provider down');

    expect(guidanceMessageWriter.write).not.toHaveBeenCalled();
  });

  it('does nothing if the dose log or its medication no longer resolves', async () => {
    const orchestrator = { run: jest.fn() };
    const doseLogRepository = {
      findMissedDoseGuidanceSubject: jest.fn().mockResolvedValue(null),
    };
    const guidanceMessageWriter = { write: jest.fn() };

    await new MissedDoseGuidanceTrigger(
      orchestrator as any,
      doseLogRepository as any,
      guidanceMessageWriter as any,
    ).trigger(99);

    expect(orchestrator.run).not.toHaveBeenCalled();
    expect(guidanceMessageWriter.write).not.toHaveBeenCalled();
  });

  it('still calls the writer with null when scheduleTimeId is null, and still resolves normally', async () => {
    const response = {
      text: 'ok',
      citationIds: [],
      validationStatus: 'accepted' as const,
      promptVersion: 'v1',
    };
    const orchestrator = { run: jest.fn().mockResolvedValue(response) };
    const doseLogRepository = {
      findMissedDoseGuidanceSubject: jest.fn().mockResolvedValue({
        patientId: 7,
        subjectMedicationId: 42,
        scheduleTimeId: null,
      }),
    };
    const guidanceMessageWriter = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      new MissedDoseGuidanceTrigger(
        orchestrator as any,
        doseLogRepository as any,
        guidanceMessageWriter as any,
      ).trigger(99),
    ).resolves.toBeUndefined();

    expect(guidanceMessageWriter.write).toHaveBeenCalledWith(
      null,
      expect.any(String),
      response,
      null,
    );
  });
});
