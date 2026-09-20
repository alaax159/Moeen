import { NotFoundException } from '@nestjs/common';

import { HealthProfileRepository } from '../../database/repository/health-profile.repository';
import { CurrentMedicationRecheckQueue } from '../../medication-safety/current-medication-recheck-queue/current-medication-recheck.queue';
import { AllergiesAndChronicConditionsService } from './allergiesAndChronicConditions.service';

describe('AllergiesAndChronicConditionsService safety recheck', () => {
  let service: AllergiesAndChronicConditionsService;

  let healthProfileRepository: {
    createAllergy: jest.Mock;
    getAllergiesByFirebaseUid: jest.Mock;
    deactivateAllergy: jest.Mock;
    createChronicCondition: jest.Mock;
    getChronicConditionsByFirebaseUid: jest.Mock;
    deactivateChronicCondition: jest.Mock;
  };

  let currentMedicationRecheckQueue: {
    enqueue: jest.Mock;
  };

  beforeEach(() => {
    healthProfileRepository = {
      createAllergy: jest.fn(),
      getAllergiesByFirebaseUid: jest.fn(),
      deactivateAllergy: jest.fn(),
      createChronicCondition: jest.fn(),
      getChronicConditionsByFirebaseUid: jest.fn(),
      deactivateChronicCondition: jest.fn(),
    };

    currentMedicationRecheckQueue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    service = new AllergiesAndChronicConditionsService(
      healthProfileRepository as unknown as HealthProfileRepository,
      currentMedicationRecheckQueue as unknown as CurrentMedicationRecheckQueue,
    );
  });

  it('rechecks current medications after allergy create or update', async () => {
    healthProfileRepository.createAllergy.mockResolvedValue({
      id: 1,
      userId: 7,
    });

    const result = await service.createAllergy('firebase-user', {} as never);

    expect(currentMedicationRecheckQueue.enqueue).toHaveBeenCalledWith(7);
    expect(result).toEqual({
      id: 1,
      userId: 7,
    });
  });

  it('rechecks current medications after allergy deactivation', async () => {
    healthProfileRepository.deactivateAllergy.mockResolvedValue({
      id: 1,
      userId: 7,
    });

    await service.deactivateAllergy('firebase-user', 1);

    expect(currentMedicationRecheckQueue.enqueue).toHaveBeenCalledWith(7);
  });

  it('rechecks current medications after chronic condition create or update', async () => {
    healthProfileRepository.createChronicCondition.mockResolvedValue({
      id: 2,
      userId: 8,
    });

    await service.createChronicCondition('firebase-user', {} as never);

    expect(currentMedicationRecheckQueue.enqueue).toHaveBeenCalledWith(8);
  });

  it('rechecks current medications after chronic condition deactivation', async () => {
    healthProfileRepository.deactivateChronicCondition.mockResolvedValue({
      id: 2,
      userId: 8,
    });

    await service.deactivateChronicCondition('firebase-user', 2);

    expect(currentMedicationRecheckQueue.enqueue).toHaveBeenCalledWith(8);
  });

  it('does not recheck when allergy creation cannot resolve the user', async () => {
    healthProfileRepository.createAllergy.mockResolvedValue(undefined);

    await service.createAllergy('missing-user', {} as never);

    expect(currentMedicationRecheckQueue.enqueue).not.toHaveBeenCalled();
  });

  it('keeps the existing not-found behavior for allergy deactivation', async () => {
    healthProfileRepository.deactivateAllergy.mockResolvedValue(undefined);

    await expect(
      service.deactivateAllergy('firebase-user', 99),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(currentMedicationRecheckQueue.enqueue).not.toHaveBeenCalled();
  });
});
