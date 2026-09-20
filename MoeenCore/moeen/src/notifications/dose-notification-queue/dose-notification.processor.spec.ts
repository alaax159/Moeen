import { Job } from 'bullmq';

import {
  CHECK_DOSE_MISSED_JOB,
  CheckDoseMissedJobData,
  DOSE_REMINDER_CATEGORY,
  SEND_DOSE_NOTIFICATION_JOB,
  SEND_FOLLOW_UP_NOTIFICATION_JOB,
  SendDoseNotificationJobData,
  SendFollowUpNotificationJobData,
} from './dose-notification-queue.constants';
import { DoseNotificationProcessor } from './dose-notification.processor';
import { DoseScheduleService } from './dose-schedule.service';
import { PushSenderPort } from '../adapters/push-sender-adapter/push-sender-adapter.port';

describe('DoseNotificationProcessor', () => {
  let processor: DoseNotificationProcessor;

  let doseScheduleService: {
    recordMissedIfStillPending: jest.Mock;
    retryMissedDoseSafetyCheck: jest.Mock;
    getDoseStatus: jest.Mock;
    recordNotified: jest.Mock;
    runRefill: jest.Mock;
    scheduleFollowUp: jest.Mock;
    getMedicationDisplayInfo: jest.Mock;
    getDoseLogUserMedicationId: jest.Mock;
    getActiveDeviceTokens: jest.Mock;
    getDoseNotifiedAt: jest.Mock;
    deactivateDeviceToken: jest.Mock;
  };

  let pushSender: { send: jest.Mock };

  beforeEach(() => {
    doseScheduleService = {
      recordMissedIfStillPending: jest.fn(),
      retryMissedDoseSafetyCheck: jest.fn(),
      getDoseStatus: jest.fn(),
      recordNotified: jest.fn(),
      runRefill: jest.fn(),
      scheduleFollowUp: jest.fn(),
      getMedicationDisplayInfo: jest.fn().mockResolvedValue(null),
      getDoseLogUserMedicationId: jest.fn().mockResolvedValue(10),
      getActiveDeviceTokens: jest.fn().mockResolvedValue([]),
      getDoseNotifiedAt: jest.fn().mockResolvedValue(null),
      deactivateDeviceToken: jest.fn(),
    };

    pushSender = { send: jest.fn() };

    processor = new DoseNotificationProcessor(
      doseScheduleService as unknown as DoseScheduleService,
      pushSender as unknown as PushSenderPort,
    );
  });

  function createMissedCheckJob(
    doseLogId: number,
  ): Job<CheckDoseMissedJobData> {
    return {
      name: CHECK_DOSE_MISSED_JOB,
      data: { doseLogId },
    } as Job<CheckDoseMissedJobData>;
  }

  function createSendDoseJob(
    data: Partial<SendDoseNotificationJobData> = {},
  ): Job<SendDoseNotificationJobData> {
    return {
      name: SEND_DOSE_NOTIFICATION_JOB,
      data: {
        doseLogId: 42,
        userMedicationId: 10,
        scheduleTimeId: 100,
        userId: 7,
        date: '2026-08-30',
        ...data,
      },
    } as Job<SendDoseNotificationJobData>;
  }

  function createFollowUpJob(
    data: Partial<SendFollowUpNotificationJobData> = {},
  ): Job<SendFollowUpNotificationJobData> {
    return {
      name: SEND_FOLLOW_UP_NOTIFICATION_JOB,
      data: {
        doseLogId: 42,
        userId: 7,
        date: '2026-08-30',
        ...data,
      },
    } as Job<SendFollowUpNotificationJobData>;
  }

  it('should mark a pending dose as missed and run safety', async () => {
    doseScheduleService.getDoseStatus.mockResolvedValue('pending');

    await processor.process(createMissedCheckJob(42));

    expect(doseScheduleService.getDoseStatus).toHaveBeenCalledWith(42);
    expect(doseScheduleService.recordMissedIfStillPending).toHaveBeenCalledWith(
      42,
    );
  });

  it('should retry safety when the dose is already missed', async () => {
    doseScheduleService.getDoseStatus.mockResolvedValue('missed');

    await processor.process(createMissedCheckJob(42));

    expect(doseScheduleService.retryMissedDoseSafetyCheck).toHaveBeenCalledWith(
      42,
    );

    expect(
      doseScheduleService.recordMissedIfStillPending,
    ).not.toHaveBeenCalled();
  });

  it('should not process a taken dose', async () => {
    doseScheduleService.getDoseStatus.mockResolvedValue('taken');

    await processor.process(createMissedCheckJob(42));

    expect(
      doseScheduleService.recordMissedIfStillPending,
    ).not.toHaveBeenCalled();

    expect(
      doseScheduleService.retryMissedDoseSafetyCheck,
    ).not.toHaveBeenCalled();
  });

  it('should not process a skipped dose', async () => {
    doseScheduleService.getDoseStatus.mockResolvedValue('skipped');

    await processor.process(createMissedCheckJob(42));

    expect(
      doseScheduleService.recordMissedIfStillPending,
    ).not.toHaveBeenCalled();

    expect(
      doseScheduleService.retryMissedDoseSafetyCheck,
    ).not.toHaveBeenCalled();
  });

  it('should propagate missed-dose failures so BullMQ can retry', async () => {
    doseScheduleService.getDoseStatus.mockResolvedValue('pending');
    doseScheduleService.recordMissedIfStillPending.mockRejectedValue(
      new Error('Safety check failed'),
    );

    await expect(processor.process(createMissedCheckJob(42))).rejects.toThrow(
      'Safety check failed',
    );
  });

  describe('handleSendDose', () => {
    const medication = {
      brandName: 'Zestril',
      genericName: 'lisinopril',
      dosageAmount: '10',
      dosageUnit: 'mg',
    };
    const devices = [{ expoPushToken: 'ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]' }];

    it('does not touch pushSender when the dose is no longer pending', async () => {
      doseScheduleService.getDoseStatus.mockResolvedValue('taken');

      await processor.process(createSendDoseJob());

      expect(pushSender.send).not.toHaveBeenCalled();
      expect(doseScheduleService.recordNotified).not.toHaveBeenCalled();
      expect(doseScheduleService.scheduleFollowUp).not.toHaveBeenCalled();
    });

    it('logs and returns without sending when there are zero active devices', async () => {
      doseScheduleService.getDoseStatus.mockResolvedValue('pending');
      doseScheduleService.getMedicationDisplayInfo.mockResolvedValue(medication);
      doseScheduleService.getActiveDeviceTokens.mockResolvedValue([]);

      await processor.process(createSendDoseJob());

      expect(pushSender.send).not.toHaveBeenCalled();
      expect(doseScheduleService.recordNotified).not.toHaveBeenCalled();
      expect(doseScheduleService.scheduleFollowUp).not.toHaveBeenCalled();
    });

    it('sends, then records notified and schedules a follow-up, in that order, on a successful send', async () => {
      doseScheduleService.getDoseStatus.mockResolvedValue('pending');
      doseScheduleService.getMedicationDisplayInfo.mockResolvedValue(medication);
      doseScheduleService.getActiveDeviceTokens.mockResolvedValue(devices);
      pushSender.send.mockResolvedValue([
        { token: devices[0].expoPushToken, status: 'ok', ticketId: 'ticket-1' },
      ]);

      await processor.process(createSendDoseJob());

      expect(pushSender.send).toHaveBeenCalledWith({
        tokens: [devices[0].expoPushToken],
        title: 'Medication reminder',
        body: 'Time to take Zestril — 10 mg',
        categoryId: DOSE_REMINDER_CATEGORY,
        data: { scheduleTimeId: 100, userMedicationId: 10 },
      });

      const sendOrder = pushSender.send.mock.invocationCallOrder[0];
      const notifiedOrder = doseScheduleService.recordNotified.mock.invocationCallOrder[0];
      const followUpOrder = doseScheduleService.scheduleFollowUp.mock.invocationCallOrder[0];

      expect(sendOrder).toBeLessThan(notifiedOrder);
      expect(notifiedOrder).toBeLessThan(followUpOrder);

      expect(doseScheduleService.recordNotified).toHaveBeenCalledWith(42);
      expect(doseScheduleService.scheduleFollowUp).toHaveBeenCalledWith({
        doseLogId: 42,
        userId: 7,
        date: '2026-08-30',
      });
    });

    it('does not record notified or schedule a follow-up when every send fails, and deactivates the DeviceNotRegistered token', async () => {
      doseScheduleService.getDoseStatus.mockResolvedValue('pending');
      doseScheduleService.getMedicationDisplayInfo.mockResolvedValue(medication);
      doseScheduleService.getActiveDeviceTokens.mockResolvedValue(devices);
      pushSender.send.mockResolvedValue([
        {
          token: devices[0].expoPushToken,
          status: 'error',
          message: 'device not registered',
          errorCode: 'DeviceNotRegistered',
        },
      ]);

      await processor.process(createSendDoseJob());

      expect(doseScheduleService.recordNotified).not.toHaveBeenCalled();
      expect(doseScheduleService.scheduleFollowUp).not.toHaveBeenCalled();
      expect(doseScheduleService.deactivateDeviceToken).toHaveBeenCalledWith(
        devices[0].expoPushToken,
      );
    });

    it('still records notified and schedules a follow-up on a partial success, and deactivates only the failed token', async () => {
      const devicesTwo = [
        { expoPushToken: 'ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]' },
        { expoPushToken: 'ExponentPushToken[BBBBBBBBBBBBBBBBBBBBBB]' },
      ];
      doseScheduleService.getDoseStatus.mockResolvedValue('pending');
      doseScheduleService.getMedicationDisplayInfo.mockResolvedValue(medication);
      doseScheduleService.getActiveDeviceTokens.mockResolvedValue(devicesTwo);
      pushSender.send.mockResolvedValue([
        {
          token: devicesTwo[0].expoPushToken,
          status: 'error',
          message: 'device not registered',
          errorCode: 'DeviceNotRegistered',
        },
        { token: devicesTwo[1].expoPushToken, status: 'ok', ticketId: 'ticket-2' },
      ]);

      await processor.process(createSendDoseJob());

      expect(doseScheduleService.recordNotified).toHaveBeenCalledWith(42);
      expect(doseScheduleService.scheduleFollowUp).toHaveBeenCalledTimes(1);
      expect(doseScheduleService.deactivateDeviceToken).toHaveBeenCalledTimes(1);
      expect(doseScheduleService.deactivateDeviceToken).toHaveBeenCalledWith(
        devicesTwo[0].expoPushToken,
      );
    });

    it('on a crash-retry (no isSnoozeReschedule) after notifiedAt was already set, skips resending the push and only retries scheduleFollowUp', async () => {
      doseScheduleService.getDoseStatus.mockResolvedValue('pending');
      doseScheduleService.getDoseNotifiedAt.mockResolvedValue(new Date('2026-08-30T10:00:00.000Z'));

      await processor.process(createSendDoseJob());

      expect(doseScheduleService.getMedicationDisplayInfo).not.toHaveBeenCalled();
      expect(doseScheduleService.getActiveDeviceTokens).not.toHaveBeenCalled();
      expect(pushSender.send).not.toHaveBeenCalled();
      expect(doseScheduleService.recordNotified).not.toHaveBeenCalled();
      expect(doseScheduleService.scheduleFollowUp).toHaveBeenCalledWith({
        doseLogId: 42,
        userId: 7,
        date: '2026-08-30',
      });
    });

    it('on a snooze re-fire (isSnoozeReschedule) sends the push again even though notifiedAt is already set', async () => {
      doseScheduleService.getDoseStatus.mockResolvedValue('pending');
      doseScheduleService.getDoseNotifiedAt.mockResolvedValue(
        new Date('2026-08-30T10:00:00.000Z'),
      );
      doseScheduleService.getMedicationDisplayInfo.mockResolvedValue(medication);
      doseScheduleService.getActiveDeviceTokens.mockResolvedValue(devices);
      pushSender.send.mockResolvedValue([
        { token: devices[0].expoPushToken, status: 'ok', ticketId: 'ticket-1' },
      ]);

      await processor.process(createSendDoseJob({ isSnoozeReschedule: true }));

      expect(pushSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Medication reminder',
          body: 'Time to take Zestril — 10 mg',
        }),
      );
      expect(doseScheduleService.recordNotified).toHaveBeenCalledWith(42);
      expect(doseScheduleService.scheduleFollowUp).toHaveBeenCalledWith({
        doseLogId: 42,
        userId: 7,
        date: '2026-08-30',
      });
    });

    it('falls back to generic wording and still sends when medication info is not found', async () => {
      doseScheduleService.getDoseStatus.mockResolvedValue('pending');
      doseScheduleService.getMedicationDisplayInfo.mockResolvedValue(null);
      doseScheduleService.getActiveDeviceTokens.mockResolvedValue(devices);
      pushSender.send.mockResolvedValue([
        { token: devices[0].expoPushToken, status: 'ok', ticketId: 'ticket-1' },
      ]);

      await processor.process(createSendDoseJob());

      expect(pushSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Medication reminder',
          body: 'Time to take your medication',
        }),
      );
      expect(doseScheduleService.recordNotified).toHaveBeenCalledWith(42);
    });
  });

  describe('handleFollowUp', () => {
    const medication = {
      brandName: 'Zestril',
      genericName: 'lisinopril',
      dosageAmount: '10',
      dosageUnit: 'mg',
    };
    const devices = [{ expoPushToken: 'ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]' }];

    it('does not touch pushSender when the dose is no longer pending', async () => {
      doseScheduleService.getDoseStatus.mockResolvedValue('taken');

      await processor.process(createFollowUpJob());

      expect(doseScheduleService.getDoseLogUserMedicationId).not.toHaveBeenCalled();
      expect(pushSender.send).not.toHaveBeenCalled();
    });

    it('resolves the medication from the doseLogId and sends the follow-up push', async () => {
      doseScheduleService.getDoseStatus.mockResolvedValue('pending');
      doseScheduleService.getDoseLogUserMedicationId.mockResolvedValue(10);
      doseScheduleService.getMedicationDisplayInfo.mockResolvedValue(medication);
      doseScheduleService.getActiveDeviceTokens.mockResolvedValue(devices);
      pushSender.send.mockResolvedValue([
        { token: devices[0].expoPushToken, status: 'ok', ticketId: 'ticket-1' },
      ]);

      await processor.process(createFollowUpJob());

      expect(doseScheduleService.getDoseLogUserMedicationId).toHaveBeenCalledWith(42);
      expect(doseScheduleService.getMedicationDisplayInfo).toHaveBeenCalledWith(10);
      expect(pushSender.send).toHaveBeenCalledWith({
        tokens: [devices[0].expoPushToken],
        title: 'Did you take your medication?',
        body: "You haven't logged Zestril yet — tap to confirm or skip.",
        categoryId: DOSE_REMINDER_CATEGORY,
        data: { doseLogId: 42 },
      });
      // A follow-up is terminal — no notifiedAt write, no re-scheduling.
      expect(doseScheduleService.recordNotified).not.toHaveBeenCalled();
      expect(doseScheduleService.scheduleFollowUp).not.toHaveBeenCalled();
    });

    it('logs and returns without sending when there are zero active devices', async () => {
      doseScheduleService.getDoseStatus.mockResolvedValue('pending');
      doseScheduleService.getMedicationDisplayInfo.mockResolvedValue(medication);
      doseScheduleService.getActiveDeviceTokens.mockResolvedValue([]);

      await processor.process(createFollowUpJob());

      expect(pushSender.send).not.toHaveBeenCalled();
    });

    it('falls back to generic wording when the dose_log has no resolvable medication', async () => {
      doseScheduleService.getDoseStatus.mockResolvedValue('pending');
      doseScheduleService.getDoseLogUserMedicationId.mockResolvedValue(null);
      doseScheduleService.getActiveDeviceTokens.mockResolvedValue(devices);
      pushSender.send.mockResolvedValue([
        { token: devices[0].expoPushToken, status: 'ok', ticketId: 'ticket-1' },
      ]);

      await processor.process(createFollowUpJob());

      expect(doseScheduleService.getMedicationDisplayInfo).not.toHaveBeenCalled();
      expect(pushSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Did you take your medication?',
          body: "You haven't logged your medication yet — tap to confirm or skip.",
        }),
      );
    });

    it('deactivates a DeviceNotRegistered token and does not throw', async () => {
      doseScheduleService.getDoseStatus.mockResolvedValue('pending');
      doseScheduleService.getDoseLogUserMedicationId.mockResolvedValue(10);
      doseScheduleService.getMedicationDisplayInfo.mockResolvedValue(medication);
      doseScheduleService.getActiveDeviceTokens.mockResolvedValue(devices);
      pushSender.send.mockResolvedValue([
        {
          token: devices[0].expoPushToken,
          status: 'error',
          message: 'device not registered',
          errorCode: 'DeviceNotRegistered',
        },
      ]);

      await expect(processor.process(createFollowUpJob())).resolves.toBeUndefined();

      expect(doseScheduleService.deactivateDeviceToken).toHaveBeenCalledWith(
        devices[0].expoPushToken,
      );
    });

    it('does not fail the job when deactivating a stale token throws', async () => {
      doseScheduleService.getDoseStatus.mockResolvedValue('pending');
      doseScheduleService.getDoseLogUserMedicationId.mockResolvedValue(10);
      doseScheduleService.getMedicationDisplayInfo.mockResolvedValue(medication);
      doseScheduleService.getActiveDeviceTokens.mockResolvedValue(devices);
      doseScheduleService.deactivateDeviceToken.mockRejectedValue(
        new Error('db down'),
      );
      pushSender.send.mockResolvedValue([
        {
          token: devices[0].expoPushToken,
          status: 'error',
          message: 'device not registered',
          errorCode: 'DeviceNotRegistered',
        },
      ]);

      await expect(processor.process(createFollowUpJob())).resolves.toBeUndefined();
    });
  });
});
