import { BadRequestException, Injectable } from '@nestjs/common';

import { DatabaseRepository } from '../../database/repository/database.repository';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly databaseRepository: DatabaseRepository) {}

  async update(firebaseUid: string, dto: UpdateNotificationPreferencesDto) {
    const hasDeviceUpdate =
      dto.expoPushToken !== undefined ||
      dto.deviceType !== undefined ||
      dto.isActive !== undefined;

    const hasFollowUpUpdate =
      dto.followUpEnabled !== undefined || dto.followUpDelayMin !== undefined;

    const hasEmergencyContactSmsUpdate =
      dto.emergencyContactSmsEnabled !== undefined;

    if (
      !hasDeviceUpdate &&
      !hasFollowUpUpdate &&
      !hasEmergencyContactSmsUpdate
    ) {
      throw new BadRequestException(
        'No notification preferences were provided',
      );
    }

    if (dto.followUpEnabled === true && dto.followUpDelayMin === undefined) {
      throw new BadRequestException(
        'followUpDelayMin is required when followUpEnabled is true',
      );
    }

    // Each concern is independent. Accumulate the ones that were requested and
    // return the single result bare when only one was, or the keyed object when
    // several were — preserving every existing response shape.
    const result: Record<string, unknown> = {};

    if (hasDeviceUpdate) {
      if (dto.expoPushToken === undefined || dto.deviceType === undefined) {
        throw new BadRequestException(
          'expoPushToken and deviceType must be provided together',
        );
      }

      result.device = await this.databaseRepository.upsertUserDevice(
        firebaseUid,
        {
          expoPushToken: dto.expoPushToken,
          deviceType: dto.deviceType,
          isActive: dto.isActive,
        },
      );
    }

    if (hasFollowUpUpdate) {
      result.followUpPreferences =
        await this.databaseRepository.upsertFollowUpPreferences(
          firebaseUid,
          dto.followUpEnabled,
          dto.followUpDelayMin,
        );
    }

    if (dto.emergencyContactSmsEnabled !== undefined) {
      result.emergencyContactSmsPreference =
        await this.databaseRepository.upsertEmergencyContactSmsPreference(
          firebaseUid,
          dto.emergencyContactSmsEnabled,
        );
    }

    const keys = Object.keys(result);
    return keys.length === 1 ? result[keys[0]] : result;
  }

  async get(firebaseUid: string) {
    return this.databaseRepository.getEmergencyContactSmsPreference(
      firebaseUid,
    );
  }
}
