import { NotFoundException } from '@nestjs/common';

import { NotificationPreferencesRepository } from './notification-preferences.repository';

describe('NotificationPreferencesRepository.getActiveDeviceTokens', () => {
  function createRepository(rows: { expoPushToken: string }[]) {
    const query = {
      from: jest.fn(),
      where: jest.fn().mockResolvedValue(rows),
    };

    query.from.mockReturnValue(query);

    const db = {
      select: jest.fn().mockReturnValue(query),
    };

    return { repository: new NotificationPreferencesRepository(db as never) };
  }

  it('returns active tokens for a user', async () => {
    const { repository } = createRepository([
      { expoPushToken: 'ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]' },
    ]);

    const result = await repository.getActiveDeviceTokens(42);

    expect(result).toEqual([
      { expoPushToken: 'ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]' },
    ]);
  });

  it('returns an empty array, not null, when the user has no active devices', async () => {
    const { repository } = createRepository([]);

    const result = await repository.getActiveDeviceTokens(42);

    expect(result).toEqual([]);
  });
});

describe('NotificationPreferencesRepository.deactivateDeviceToken', () => {
  function createRepository() {
    const query = {
      set: jest.fn(),
      where: jest.fn().mockResolvedValue(undefined),
    };

    query.set.mockReturnValue(query);

    const db = {
      update: jest.fn().mockReturnValue(query),
    };

    return {
      repository: new NotificationPreferencesRepository(db as never),
      db,
      query,
    };
  }

  it('sets isActive to false for the given token', async () => {
    const { repository, db, query } = createRepository();

    await repository.deactivateDeviceToken(
      'ExponentPushToken[AAAAAAAAAAAAAAAAAAAAAA]',
    );

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(query.set).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });
});

describe('NotificationPreferencesRepository.getEmergencyContactSmsEnabled', () => {
  function createRepository(rows: { enabled: boolean }[]) {
    const query = {
      from: jest.fn(),
      where: jest.fn(),
      limit: jest.fn().mockResolvedValue(rows),
    };

    query.from.mockReturnValue(query);
    query.where.mockReturnValue(query);

    const db = {
      select: jest.fn().mockReturnValue(query),
    };

    return { repository: new NotificationPreferencesRepository(db as never) };
  }

  it('returns the stored preference for a user', async () => {
    const { repository } = createRepository([{ enabled: false }]);

    expect(await repository.getEmergencyContactSmsEnabled(42)).toBe(false);
  });

  it('defaults to true when the user has no notification_prefs row', async () => {
    const { repository } = createRepository([]);

    expect(await repository.getEmergencyContactSmsEnabled(42)).toBe(true);
  });
});

describe('NotificationPreferencesRepository.upsertEmergencyContactSmsPreference', () => {
  function createRepository(userRows: { id: number }[]) {
    const selectQuery = {
      from: jest.fn(),
      where: jest.fn(),
      limit: jest.fn().mockResolvedValue(userRows),
    };
    selectQuery.from.mockReturnValue(selectQuery);
    selectQuery.where.mockReturnValue(selectQuery);

    const insertQuery = {
      values: jest.fn(),
      onConflictDoUpdate: jest.fn(),
      returning: jest.fn().mockResolvedValue([{ emergencyContactSmsEnabled: true }]),
    };
    insertQuery.values.mockReturnValue(insertQuery);
    insertQuery.onConflictDoUpdate.mockReturnValue(insertQuery);

    const db = {
      select: jest.fn().mockReturnValue(selectQuery),
      insert: jest.fn().mockReturnValue(insertQuery),
    };

    return {
      repository: new NotificationPreferencesRepository(db as never),
      insertQuery,
    };
  }

  it('upserts on the userId conflict target with the new flag in the update set', async () => {
    const { repository, insertQuery } = createRepository([{ id: 7 }]);

    await repository.upsertEmergencyContactSmsPreference('firebase-uid', false);

    expect(insertQuery.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, emergencyContactSmsEnabled: false }),
    );
    expect(insertQuery.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ emergencyContactSmsEnabled: false }),
      }),
    );
  });

  it('throws NotFoundException when the firebaseUid matches no user', async () => {
    const { repository } = createRepository([]);

    await expect(
      repository.upsertEmergencyContactSmsPreference('missing-uid', true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
