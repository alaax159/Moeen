import { DateTime } from 'luxon';

import { DatabaseRepository } from '../../database/repository/database.repository';
import { MedicationSafetyEventsService } from '../../medication-safety/medication-safety-events.service';
import { MedicationSafetyTriggerType } from '../../medication-safety/medication-safety.events';
import {
  CHECK_DOSE_MISSED_JOB,
  DOSE_MISSED_GRACE_MINUTES,
  SEND_DOSE_NOTIFICATION_JOB,
} from './dose-notification-queue.constants';
import { DoseScheduleService } from './dose-schedule.service';

describe('DoseScheduleService missed-dose detection', () => {
  let service: DoseScheduleService;

  let queue: {
    add: jest.Mock;
    remove: jest.Mock;
  };

  let databaseRepository: {
    markDoseMissedIfPending: jest.Mock;
    getDoseLogUserMedicationId: jest.Mock;
  };

  let medicationSafetyEventsService: {
    emitTriggerAndWait: jest.Mock;
  };

  let missedDoseGuidanceTrigger: {
    trigger: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-16T10:00:00.000Z'));

    queue = {
      add: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    databaseRepository = {
      markDoseMissedIfPending: jest.fn().mockResolvedValue(77),
      getDoseLogUserMedicationId: jest.fn().mockResolvedValue(77),
    };

    medicationSafetyEventsService = {
      emitTriggerAndWait: jest.fn().mockResolvedValue({ runId: 'run-123' }),
    };

    missedDoseGuidanceTrigger = {
      trigger: jest.fn().mockResolvedValue(undefined),
    };

    service = new DoseScheduleService(
      queue as never,
      databaseRepository as unknown as DatabaseRepository,
      medicationSafetyEventsService as unknown as MedicationSafetyEventsService,
      missedDoseGuidanceTrigger as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function scheduleMissedCheck(
    doseLogId: number,
    scheduledFor: DateTime,
  ): Promise<void> {
    const internalService = service as unknown as {
      scheduleMissedCheck(
        doseLogId: number,
        scheduledFor: DateTime,
      ): Promise<void>;
    };

    await internalService.scheduleMissedCheck(doseLogId, scheduledFor);
  }

  it('should schedule a missed-dose check after the grace period', async () => {
    const scheduledFor = DateTime.fromISO('2026-08-16T10:10:00.000Z');

    await scheduleMissedCheck(42, scheduledFor);

    const expectedDelay = (10 + DOSE_MISSED_GRACE_MINUTES) * 60 * 1000;

    expect(queue.remove).toHaveBeenCalledWith('missed-check-42');

    expect(queue.add).toHaveBeenCalledWith(
      CHECK_DOSE_MISSED_JOB,
      { doseLogId: 42 },
      {
        jobId: 'missed-check-42',
        delay: expectedDelay,
      },
    );

    expect(databaseRepository.markDoseMissedIfPending).not.toHaveBeenCalled();
  });

  it('should queue the missed-dose check immediately when the grace period already passed', async () => {
    const scheduledFor = DateTime.fromISO('2026-08-16T09:29:00.000Z');

    await scheduleMissedCheck(42, scheduledFor);

    expect(queue.remove).toHaveBeenCalledWith('missed-check-42');

    expect(queue.add).toHaveBeenCalledWith(
      CHECK_DOSE_MISSED_JOB,
      { doseLogId: 42 },
      {
        jobId: 'missed-check-42',
        delay: 0,
      },
    );

    expect(databaseRepository.markDoseMissedIfPending).not.toHaveBeenCalled();
  });

  it('should run the safety router after a pending dose is marked missed', async () => {
    await service.recordMissedIfStillPending(42);

    expect(databaseRepository.markDoseMissedIfPending).toHaveBeenCalledWith(42);

    expect(
      medicationSafetyEventsService.emitTriggerAndWait,
    ).toHaveBeenCalledWith({
      userMedicationId: 77,
      trigger: MedicationSafetyTriggerType.MISSED,
      idempotencyKey: 'dose-missed:42',
    });
  });

  it('should not run safety when no pending dose was updated', async () => {
    databaseRepository.markDoseMissedIfPending.mockResolvedValue(null);

    await service.recordMissedIfStillPending(42);

    expect(
      medicationSafetyEventsService.emitTriggerAndWait,
    ).not.toHaveBeenCalled();
  });

  it('should not fire the guidance trigger when no pending dose was updated', async () => {
    databaseRepository.markDoseMissedIfPending.mockResolvedValue(null);

    await service.recordMissedIfStillPending(42);

    expect(missedDoseGuidanceTrigger.trigger).not.toHaveBeenCalled();
  });

  it('should retry safety for a dose that is already missed', async () => {
    await service.retryMissedDoseSafetyCheck(42);

    expect(databaseRepository.getDoseLogUserMedicationId).toHaveBeenCalledWith(
      42,
    );

    expect(
      medicationSafetyEventsService.emitTriggerAndWait,
    ).toHaveBeenCalledWith({
      userMedicationId: 77,
      trigger: MedicationSafetyTriggerType.MISSED,
      idempotencyKey: 'dose-missed:42',
    });
  });

  it('should propagate safety failures so BullMQ can retry the job', async () => {
    medicationSafetyEventsService.emitTriggerAndWait.mockRejectedValue(
      new Error('Safety check failed'),
    );

    await expect(service.recordMissedIfStillPending(42)).rejects.toThrow(
      'Safety check failed',
    );
  });

  it('should fire the missed-dose guidance trigger after recording the miss', async () => {
    await service.recordMissedIfStillPending(42);

    expect(missedDoseGuidanceTrigger.trigger).toHaveBeenCalledWith(
      42,
      'run-123',
    );
  });

  it('should still fire the guidance trigger when the safety check throws, then propagate the safety error', async () => {
    medicationSafetyEventsService.emitTriggerAndWait.mockRejectedValue(
      new Error('Safety check failed'),
    );

    await expect(service.recordMissedIfStillPending(42)).rejects.toThrow(
      'Safety check failed',
    );

    expect(missedDoseGuidanceTrigger.trigger).toHaveBeenCalledWith(42, null);
  });

  it('should treat a safety trigger without a run result as unavailable and retryable', async () => {
    medicationSafetyEventsService.emitTriggerAndWait.mockResolvedValue(
      undefined,
    );

    await expect(service.recordMissedIfStillPending(42)).rejects.toThrow(
      /without a persisted run/i,
    );

    expect(missedDoseGuidanceTrigger.trigger).toHaveBeenCalledWith(42, null);
  });

  it('should propagate guidance failures so BullMQ can retry generation', async () => {
    missedDoseGuidanceTrigger.trigger.mockRejectedValue(
      new Error('Guidance failed'),
    );

    await expect(service.recordMissedIfStillPending(42)).rejects.toThrow(
      'Guidance failed',
    );
  });

  it('replaces the unavailable-safety fallback with exact-run guidance on retry', async () => {
    // First pass: the safety check fails, so BullMQ retries the job.
    medicationSafetyEventsService.emitTriggerAndWait.mockRejectedValueOnce(
      new Error('Safety check failed'),
    );

    await expect(service.recordMissedIfStillPending(42)).rejects.toThrow(
      'Safety check failed',
    );

    // Retry reuses the safety idempotency key and replaces the cached fallback.
    medicationSafetyEventsService.emitTriggerAndWait.mockResolvedValueOnce({
      runId: 'run-retry',
    });
    await service.retryMissedDoseSafetyCheck(42);

    expect(missedDoseGuidanceTrigger.trigger).toHaveBeenNthCalledWith(
      1,
      42,
      null,
    );
    expect(missedDoseGuidanceTrigger.trigger).toHaveBeenNthCalledWith(
      2,
      42,
      'run-retry',
    );
  });
});

describe('DoseScheduleService.requeueSendDose', () => {
  let service: DoseScheduleService;
  let queue: { add: jest.Mock; remove: jest.Mock };

  beforeEach(() => {
    queue = {
      add: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    service = new DoseScheduleService(
      queue as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('re-adds the send-dose job under the same jobId with the snooze flag stamped on', async () => {
    await service.requeueSendDose(
      {
        doseLogId: 42,
        userMedicationId: 10,
        scheduleTimeId: 100,
        userId: 7,
        date: '2026-08-30',
      },
      120_000,
    );

    expect(queue.remove).toHaveBeenCalledWith('dose-42');
    expect(queue.add).toHaveBeenCalledWith(
      SEND_DOSE_NOTIFICATION_JOB,
      {
        doseLogId: 42,
        userMedicationId: 10,
        scheduleTimeId: 100,
        userId: 7,
        date: '2026-08-30',
        isSnoozeReschedule: true,
      },
      { jobId: 'dose-42', delay: 120_000 },
    );
  });
});
