import { Logger } from '@nestjs/common';

import { EmergencyContactRepository } from '../database/repository/emergency-contact.repository';
import { EmergencyNotificationLogRepository } from '../database/repository/emergency-notification-log.repository';
import { HealthProfileRepository } from '../database/repository/health-profile.repository';
import { NotificationPreferencesRepository } from '../database/repository/notification-preferences.repository';
import {
  SmsSendResult,
  SmsSenderPort,
} from '../notifications/adapters/sms-sender-adapter/sms-sender-adapter.port';
import { EmergencyContactNotificationService } from './emergency-contact-notification.service';

function build() {
  const sms = {
    send: jest.fn((phoneNumber: string): Promise<SmsSendResult> =>
      Promise.resolve({
        phoneNumber,
        status: 'ok',
        messageId: `SM-${phoneNumber}`,
      }),
    ),
  };
  const emergencyContactRepository = { listByUserId: jest.fn() };
  const healthProfileRepository = {
    getEmergencyCardProfileByUserId: jest.fn(),
  };
  const notificationPreferencesRepository = {
    getEmergencyContactSmsEnabled: jest.fn().mockResolvedValue(true),
  };
  const emergencyNotificationLogRepository = {
    record: jest.fn().mockResolvedValue({}),
    findRecentByUserId: jest.fn().mockResolvedValue(null),
    runWithUserNotificationLock: jest.fn(
      async (_userId: number, action: () => Promise<unknown>) => action(),
    ),
  };

  const service = new EmergencyContactNotificationService(
    sms as unknown as SmsSenderPort,
    emergencyContactRepository as unknown as EmergencyContactRepository,
    healthProfileRepository as unknown as HealthProfileRepository,
    notificationPreferencesRepository as unknown as NotificationPreferencesRepository,
    emergencyNotificationLogRepository as unknown as EmergencyNotificationLogRepository,
  );

  return {
    service,
    sms,
    emergencyContactRepository,
    healthProfileRepository,
    notificationPreferencesRepository,
    emergencyNotificationLogRepository,
  };
}

const contact = (id: number, phone: string) => ({
  id,
  userId: 7,
  name: `Contact ${id}`,
  phone,
  relationship: null,
  isPrimary: id === 1,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('EmergencyContactNotificationService', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('loads the contacts and profile for the given userId', async () => {
    const { service, emergencyContactRepository, healthProfileRepository } =
      build();
    emergencyContactRepository.listByUserId.mockResolvedValue([
      contact(1, '+15550000001'),
    ]);
    healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue({
      firstName: 'Jane',
      lastName: 'Doe',
    });

    await service.notify(7, 'severe_medication_reaction');

    expect(emergencyContactRepository.listByUserId).toHaveBeenCalledWith(7);
    expect(
      healthProfileRepository.getEmergencyCardProfileByUserId,
    ).toHaveBeenCalledWith(7);
  });

  it('sends one SMS per contact, each with the contact phone and the name-interpolated message', async () => {
    const {
      service,
      sms,
      emergencyContactRepository,
      healthProfileRepository,
    } = build();
    emergencyContactRepository.listByUserId.mockResolvedValue([
      contact(1, '+15550000001'),
      contact(2, '+15550000002'),
    ]);
    healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue({
      firstName: 'Jane',
      lastName: 'Doe',
    });

    const results = await service.notify(7, 'severe_medication_reaction');

    expect(sms.send).toHaveBeenCalledTimes(2);
    expect(sms.send).toHaveBeenCalledWith(
      '+15550000001',
      expect.stringContaining('Jane Doe'),
    );
    expect(sms.send).toHaveBeenCalledWith(
      '+15550000002',
      expect.stringContaining('Jane Doe'),
    );
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
  });

  it('returns [] and sends nothing when the user has no emergency contacts', async () => {
    const {
      service,
      sms,
      emergencyContactRepository,
      healthProfileRepository,
    } = build();
    emergencyContactRepository.listByUserId.mockResolvedValue([]);
    healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue({
      firstName: 'Jane',
      lastName: 'Doe',
    });

    const results = await service.notify(7, 'severe_medication_reaction');

    expect(results).toEqual([]);
    expect(sms.send).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic patient phrase when the profile has no name', async () => {
    const {
      service,
      sms,
      emergencyContactRepository,
      healthProfileRepository,
    } = build();
    emergencyContactRepository.listByUserId.mockResolvedValue([
      contact(1, '+15550000001'),
    ]);
    healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue({
      firstName: null,
      lastName: null,
    });

    await service.notify(7, 'severe_medication_reaction');

    expect(sms.send).toHaveBeenCalledWith(
      '+15550000001',
      expect.stringContaining('a person you are an emergency contact for'),
    );
  });

  it('still returns a result per contact when some sends fail', async () => {
    const {
      service,
      sms,
      emergencyContactRepository,
      healthProfileRepository,
    } = build();
    sms.send
      .mockResolvedValueOnce({
        phoneNumber: '+15550000001',
        status: 'ok',
        messageId: 'SM1',
      })
      .mockResolvedValueOnce({
        phoneNumber: '+15550000002',
        status: 'error',
        message: 'invalid number',
        errorCode: '21211',
      });
    emergencyContactRepository.listByUserId.mockResolvedValue([
      contact(1, '+15550000001'),
      contact(2, '+15550000002'),
    ]);
    healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue(
      undefined,
    );

    const results = await service.notify(7, 'severe_medication_reaction');

    expect(results.map((r) => r.status)).toEqual(['ok', 'error']);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('1/2 SMS sent'),
    );
  });

  describe('delivery log', () => {
    it('writes one log row per contact on the success path', async () => {
      const {
        service,
        emergencyContactRepository,
        healthProfileRepository,
        emergencyNotificationLogRepository,
      } = build();
      emergencyContactRepository.listByUserId.mockResolvedValue([
        contact(1, '+15550000001'),
        contact(2, '+15550000002'),
      ]);
      healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue(
        {
          firstName: 'Jane',
          lastName: 'Doe',
        },
      );

      await service.notify(7, 'severe_medication_reaction');

      expect(emergencyNotificationLogRepository.record).toHaveBeenCalledTimes(
        2,
      );
      expect(emergencyNotificationLogRepository.record).toHaveBeenCalledWith({
        userId: 7,
        contactId: 1,
        event: 'severe_medication_reaction',
        status: 'sent',
      });
      expect(emergencyNotificationLogRepository.record).toHaveBeenCalledWith({
        userId: 7,
        contactId: 2,
        event: 'severe_medication_reaction',
        status: 'sent',
      });
    });

    it('writes a failed log row for the contact whose send failed', async () => {
      const {
        service,
        sms,
        emergencyContactRepository,
        healthProfileRepository,
        emergencyNotificationLogRepository,
      } = build();
      sms.send
        .mockResolvedValueOnce({
          phoneNumber: '+15550000001',
          status: 'ok',
          messageId: 'SM1',
        })
        .mockResolvedValueOnce({
          phoneNumber: '+15550000002',
          status: 'error',
          message: 'invalid number',
          errorCode: '21211',
        });
      emergencyContactRepository.listByUserId.mockResolvedValue([
        contact(1, '+15550000001'),
        contact(2, '+15550000002'),
      ]);
      healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue(
        undefined,
      );

      await service.notify(7, 'severe_medication_reaction');

      expect(emergencyNotificationLogRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ contactId: 1, status: 'sent' }),
      );
      expect(emergencyNotificationLogRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ contactId: 2, status: 'failed' }),
      );
    });
  });

  describe('preference gate', () => {
    it('returns [] and sends nothing when emergency-contact SMS is disabled', async () => {
      const {
        service,
        sms,
        emergencyContactRepository,
        healthProfileRepository,
        notificationPreferencesRepository,
        emergencyNotificationLogRepository,
      } = build();
      notificationPreferencesRepository.getEmergencyContactSmsEnabled.mockResolvedValue(
        false,
      );
      emergencyContactRepository.listByUserId.mockResolvedValue([
        contact(1, '+15550000001'),
      ]);
      healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue(
        {
          firstName: 'Jane',
          lastName: 'Doe',
        },
      );

      const results = await service.notify(7, 'severe_medication_reaction');

      expect(results).toEqual([]);
      expect(sms.send).not.toHaveBeenCalled();
      expect(emergencyNotificationLogRepository.record).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('disabled for userId=7'),
      );
    });

    it('sends normally when the preference is enabled', async () => {
      const {
        service,
        sms,
        emergencyContactRepository,
        healthProfileRepository,
        notificationPreferencesRepository,
      } = build();
      notificationPreferencesRepository.getEmergencyContactSmsEnabled.mockResolvedValue(
        true,
      );
      emergencyContactRepository.listByUserId.mockResolvedValue([
        contact(1, '+15550000001'),
      ]);
      healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue(
        {
          firstName: 'Jane',
          lastName: 'Doe',
        },
      );

      const results = await service.notify(7, 'severe_medication_reaction');

      expect(sms.send).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
    });
  });

  describe('repeat guard', () => {
    it('skips sending and logs a warning when a notification was logged within the window', async () => {
      const {
        service,
        sms,
        emergencyContactRepository,
        healthProfileRepository,
        emergencyNotificationLogRepository,
      } = build();
      emergencyNotificationLogRepository.findRecentByUserId.mockResolvedValue({
        id: 99,
        userId: 7,
        contactId: 1,
        event: 'severe_medication_reaction',
        status: 'sent',
        sentAt: new Date(),
      });
      emergencyContactRepository.listByUserId.mockResolvedValue([
        contact(1, '+15550000001'),
      ]);
      healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue(
        {
          firstName: 'Jane',
          lastName: 'Doe',
        },
      );

      const results = await service.notify(7, 'severe_medication_reaction');

      expect(results).toEqual([]);
      expect(sms.send).not.toHaveBeenCalled();
      expect(emergencyNotificationLogRepository.record).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('skipped'));
    });

    it('queries the log with a ~30-minute-old cutoff and sends when nothing recent is found', async () => {
      const {
        service,
        sms,
        emergencyContactRepository,
        healthProfileRepository,
        emergencyNotificationLogRepository,
      } = build();
      emergencyNotificationLogRepository.findRecentByUserId.mockResolvedValue(
        null,
      );
      emergencyContactRepository.listByUserId.mockResolvedValue([
        contact(1, '+15550000001'),
      ]);
      healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue(
        {
          firstName: 'Jane',
          lastName: 'Doe',
        },
      );

      const before = Date.now();
      await service.notify(7, 'severe_medication_reaction');
      const after = Date.now();

      expect(
        emergencyNotificationLogRepository.findRecentByUserId,
      ).toHaveBeenCalledTimes(1);
      const [calledUserId, since] =
        emergencyNotificationLogRepository.findRecentByUserId.mock.calls[0];
      expect(calledUserId).toBe(7);
      expect(since).toBeInstanceOf(Date);
      const windowMs = 30 * 60_000;
      expect((since as Date).getTime()).toBeGreaterThanOrEqual(
        before - windowMs - 1000,
      );
      expect((since as Date).getTime()).toBeLessThanOrEqual(
        after - windowMs + 1000,
      );
      expect(sms.send).toHaveBeenCalledTimes(1);
    });
    it('serializes concurrent notifications so only one request sends SMS', async () => {
      const {
        service,
        sms,
        emergencyContactRepository,
        healthProfileRepository,
        emergencyNotificationLogRepository,
      } = build();

      emergencyContactRepository.listByUserId.mockResolvedValue([
        contact(1, '+15550000001'),
      ]);

      healthProfileRepository.getEmergencyCardProfileByUserId.mockResolvedValue(
        {
          firstName: 'Jane',
          lastName: 'Doe',
        },
      );

      let successfulNotificationExists = false;
      let lockQueue = Promise.resolve();

      emergencyNotificationLogRepository.runWithUserNotificationLock.mockImplementation(
        (_userId: number, action: () => Promise<unknown>) => {
          const run = lockQueue.then(action);

          lockQueue = run.then(
            () => undefined,
            () => undefined,
          );

          return run;
        },
      );

      emergencyNotificationLogRepository.findRecentByUserId.mockImplementation(
        async () =>
          successfulNotificationExists
            ? {
                id: 99,
                userId: 7,
                contactId: 1,
                event: 'severe_medication_reaction',
                status: 'sent',
                sentAt: new Date(),
              }
            : null,
      );

      emergencyNotificationLogRepository.record.mockImplementation(
        async (entry: { status: string }) => {
          if (entry.status === 'sent') {
            successfulNotificationExists = true;
          }

          return {};
        },
      );

      const [first, second] = await Promise.all([
        service.notify(7, 'severe_medication_reaction'),
        service.notify(7, 'severe_medication_reaction'),
      ]);

      expect(sms.send).toHaveBeenCalledTimes(1);
      expect(first.length + second.length).toBe(1);
    });
  });
});
