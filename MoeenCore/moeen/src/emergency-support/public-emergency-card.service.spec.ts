import { createHash, randomBytes } from 'node:crypto';

import { NotFoundException } from '@nestjs/common';

import { PublicEmergencyCardService } from './public-emergency-card.service';

describe('PublicEmergencyCardService', () => {
  const repository = { findEnabledOwnerByTokenHash: jest.fn() };
  const cardService = { getEmergencyMedicalCard: jest.fn() };
  const service = new PublicEmergencyCardService(
    repository as never,
    cardService as never,
  );
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const card = {
    patient: {
      firstName: 'Maya',
      lastName: null,
      dateOfBirth: null,
      gender: null,
      bloodType: 'O+',
    },
    allergies: [],
    chronicConditions: [],
    medications: [],
    emergencyContacts: [],
    lastUpdated: null,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findEnabledOwnerByTokenHash.mockResolvedValue({ userId: 42 });
    cardService.getEmergencyMedicalCard.mockResolvedValue(card);
  });

  it('hashes a valid token, revalidates it, and returns only the card contract', async () => {
    const result = await service.getCard(token);

    expect(result).toEqual(card);

    expect(repository.findEnabledOwnerByTokenHash).toHaveBeenNthCalledWith(
      1,
      tokenHash,
    );
    expect(repository.findEnabledOwnerByTokenHash).toHaveBeenNthCalledWith(
      2,
      tokenHash,
    );
    expect(repository.findEnabledOwnerByTokenHash).not.toHaveBeenCalledWith(
      token,
    );
    expect(cardService.getEmergencyMedicalCard).toHaveBeenCalledWith(42);
    expect(result).not.toHaveProperty('userId');
  });

  it.each([
    'not-base64url!',
    randomBytes(31).toString('base64url'),
    `${randomBytes(32).toString('base64url')}a`,
  ])('rejects malformed token %s before database access', async (malformed) => {
    await expect(service.getCard(malformed)).rejects.toEqual(
      new NotFoundException('Emergency card not found'),
    );
    expect(repository.findEnabledOwnerByTokenHash).not.toHaveBeenCalled();
    expect(cardService.getEmergencyMedicalCard).not.toHaveBeenCalled();
  });

  it.each(['unknown', 'disabled', 'superseded'])(
    'returns the same generic 404 for a %s token',
    async () => {
      repository.findEnabledOwnerByTokenHash.mockResolvedValueOnce(null);

      await expect(service.getCard(token)).rejects.toMatchObject({
        status: 404,
        message: 'Emergency card not found',
      });
      expect(cardService.getEmergencyMedicalCard).not.toHaveBeenCalled();
    },
  );

  it('returns a generic 404 when access is revoked during aggregation', async () => {
    repository.findEnabledOwnerByTokenHash
      .mockResolvedValueOnce({ userId: 42 })
      .mockResolvedValueOnce(null);

    await expect(service.getCard(token)).rejects.toMatchObject({
      status: 404,
      message: 'Emergency card not found',
    });
    expect(cardService.getEmergencyMedicalCard).toHaveBeenCalledWith(42);
    expect(repository.findEnabledOwnerByTokenHash).toHaveBeenCalledTimes(2);
    expect(
      cardService.getEmergencyMedicalCard.mock.invocationCallOrder[0],
    ).toBeLessThan(
      repository.findEnabledOwnerByTokenHash.mock.invocationCallOrder[1],
    );
  });

  it('does not return a card if the revalidated token resolves to another owner', async () => {
    repository.findEnabledOwnerByTokenHash
      .mockResolvedValueOnce({ userId: 42 })
      .mockResolvedValueOnce({ userId: 84 });

    await expect(service.getCard(token)).rejects.toMatchObject({ status: 404 });
  });

  it('prevents an old-token response when regeneration occurs during aggregation', async () => {
    repository.findEnabledOwnerByTokenHash
      .mockResolvedValueOnce({ userId: 42 })
      .mockResolvedValueOnce(null);

    await expect(service.getCard(token)).rejects.toMatchObject({
      status: 404,
      message: 'Emergency card not found',
    });
    expect(repository.findEnabledOwnerByTokenHash).toHaveBeenNthCalledWith(
      2,
      tokenHash,
    );
  });

  it('does not log the bearer token or medical-card contents', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    const error = jest.spyOn(console, 'error').mockImplementation();

    await service.getCard(token);

    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });
});
