import { BadRequestException } from '@nestjs/common';

import { DatabaseRepository } from '../../database/repository/database.repository';
import { DeviceType } from './dto/update-notification-preferences.dto';
import { NotificationPreferencesService } from './notification-preferences.service';

function build() {
  const databaseRepository = {
    upsertUserDevice: jest.fn().mockResolvedValue({ id: 'device-1' }),
    upsertFollowUpPreferences: jest
      .fn()
      .mockResolvedValue({ followUpEnabled: true }),
    upsertEmergencyContactSmsPreference: jest
      .fn()
      .mockResolvedValue({ emergencyContactSmsEnabled: false }),
    getEmergencyContactSmsPreference: jest.fn().mockResolvedValue({
      emergencyContactSmsEnabled: true,
    }),
  };

  const service = new NotificationPreferencesService(
    databaseRepository as unknown as DatabaseRepository,
  );

  return { service, databaseRepository };
}

const UID = 'firebase-uid';

describe('NotificationPreferencesService.get', () => {
  it('returns the emergency-contact SMS preference for the authenticated user', async () => {
    const { service, databaseRepository } = build();

    const result = await service.get(UID);

    expect(
      databaseRepository.getEmergencyContactSmsPreference,
    ).toHaveBeenCalledWith(UID);

    expect(result).toEqual({
      emergencyContactSmsEnabled: true,
    });
  });
});

describe('NotificationPreferencesService.update — emergencyContactSmsEnabled', () => {
  it('upserts the preference and returns it bare when it is the only field', async () => {
    const { service, databaseRepository } = build();

    const result = await service.update(UID, {
      emergencyContactSmsEnabled: false,
    });

    expect(
      databaseRepository.upsertEmergencyContactSmsPreference,
    ).toHaveBeenCalledWith(UID, false);
    expect(result).toEqual({ emergencyContactSmsEnabled: false });
  });

  it('rejects a body with no preferences at all', async () => {
    const { service } = build();

    await expect(service.update(UID, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns a keyed object when combined with a device update', async () => {
    const { service, databaseRepository } = build();

    const result = await service.update(UID, {
      expoPushToken: 'ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]',
      deviceType: DeviceType.IOS,
      emergencyContactSmsEnabled: true,
    });

    expect(databaseRepository.upsertUserDevice).toHaveBeenCalledTimes(1);
    expect(
      databaseRepository.upsertEmergencyContactSmsPreference,
    ).toHaveBeenCalledWith(UID, true);
    expect(result).toEqual({
      device: { id: 'device-1' },
      emergencyContactSmsPreference: { emergencyContactSmsEnabled: false },
    });
  });

  it('leaves the existing follow-up-only response shape unchanged', async () => {
    const { service, databaseRepository } = build();

    const result = await service.update(UID, {
      followUpEnabled: true,
      followUpDelayMin: 30,
    });

    expect(databaseRepository.upsertFollowUpPreferences).toHaveBeenCalledWith(
      UID,
      true,
      30,
    );
    expect(
      databaseRepository.upsertEmergencyContactSmsPreference,
    ).not.toHaveBeenCalled();
    expect(result).toEqual({ followUpEnabled: true });
  });
});
