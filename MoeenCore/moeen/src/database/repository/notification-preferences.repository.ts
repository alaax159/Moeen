import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DeviceType } from '../../notifications/notification-preferences/dto/update-notification-preferences.dto';
import { DRIZZLE } from '../database.constants';
import * as schema from '../schema';

type Database = NodePgDatabase<typeof schema>;

@Injectable()
export class NotificationPreferencesRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: Database,
  ) {}

  async upsertUserDevice(
    firebaseUid: string,
    dto: {
      expoPushToken: string;
      deviceType: DeviceType;
      isActive?: boolean;
    },
  ) {
    const [currentUser] = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.firebaseUid, firebaseUid))
      .limit(1);

    if (!currentUser) {
      throw new NotFoundException('User was not found');
    }

    const [device] = await this.db
      .insert(schema.userDevice)
      .values({
        userId: currentUser.id,
        expoPushToken: dto.expoPushToken,
        deviceType: dto.deviceType,
        isActive: dto.isActive ?? true,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.userDevice.expoPushToken,
        set: {
          userId: currentUser.id,
          deviceType: dto.deviceType,
          isActive: dto.isActive ?? true,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    return device;
  }

  async upsertFollowUpPreferences(
    firebaseUid: string,
    followUpEnabled?: boolean,
    followUpDelayMin?: number,
  ) {
    const [currentUser] = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.firebaseUid, firebaseUid))
      .limit(1);

    if (!currentUser) {
      throw new NotFoundException('User was not found');
    }

    const [preferences] = await this.db
      .insert(schema.notificationPreference)
      .values({
        userId: currentUser.id,
        followUpEnabled: followUpEnabled ?? false,
        followUpDelayMin: followUpDelayMin ?? null,
      })
      .onConflictDoUpdate({
        target: schema.notificationPreference.userId,
        set: {
          ...(followUpEnabled !== undefined ? { followUpEnabled } : {}),
          ...(followUpDelayMin !== undefined ? { followUpDelayMin } : {}),
          updatedAt: new Date(),
        },
      })
      .returning();

    return preferences;
  }

  async upsertEmergencyContactSmsPreference(
    firebaseUid: string,
    emergencyContactSmsEnabled: boolean,
  ) {
    const [currentUser] = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.firebaseUid, firebaseUid))
      .limit(1);

    if (!currentUser) {
      throw new NotFoundException('User was not found');
    }

    const [preferences] = await this.db
      .insert(schema.notificationPreference)
      .values({
        userId: currentUser.id,
        emergencyContactSmsEnabled,
      })
      .onConflictDoUpdate({
        target: schema.notificationPreference.userId,
        set: {
          emergencyContactSmsEnabled,
          updatedAt: new Date(),
        },
      })
      .returning();

    return preferences;
  }

  /**
   * Effective emergency-contact SMS preference for notify(). Defaults to true
   * when the user has no notification_prefs row yet (matches the column DEFAULT).
   */
  async getEmergencyContactSmsEnabled(userId: number): Promise<boolean> {
    const [row] = await this.db
      .select({
        enabled: schema.notificationPreference.emergencyContactSmsEnabled,
      })
      .from(schema.notificationPreference)
      .where(eq(schema.notificationPreference.userId, userId))
      .limit(1);

    return row?.enabled ?? true;
  }

  async getEmergencyContactSmsPreference(firebaseUid: string) {
    const [currentUser] = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.firebaseUid, firebaseUid))
      .limit(1);

    if (!currentUser) {
      throw new NotFoundException('User was not found');
    }

    return {
      emergencyContactSmsEnabled: await this.getEmergencyContactSmsEnabled(
        currentUser.id,
      ),
    };
  }

  async getFollowUpPreferences(userId: number) {
    const [preferences] = await this.db
      .select({
        followUpEnabled: schema.notificationPreference.followUpEnabled,
        followUpDelayMin: schema.notificationPreference.followUpDelayMin,
      })
      .from(schema.notificationPreference)
      .where(eq(schema.notificationPreference.userId, userId))
      .limit(1);

    return preferences ?? null;
  }

  async getActiveDeviceTokens(
    userId: number,
  ): Promise<{ expoPushToken: string }[]> {
    return this.db
      .select({ expoPushToken: schema.userDevice.expoPushToken })
      .from(schema.userDevice)
      .where(
        and(
          eq(schema.userDevice.userId, userId),
          eq(schema.userDevice.isActive, true),
        ),
      );
  }

  async deactivateDeviceToken(expoPushToken: string): Promise<void> {
    await this.db
      .update(schema.userDevice)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.userDevice.expoPushToken, expoPushToken));
  }
}
