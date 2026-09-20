import { UserMedicationRepository } from '../database/repository/user-medication.repository';
import { CurrentMedicationRecheckService } from './current-medication-recheck.service';
import { MedicationSafetyRouterService } from './medication-safety-router.service';

describe('CurrentMedicationRecheckService', () => {
  let service: CurrentMedicationRecheckService;

  let userMedicationRepository: {
    getActiveMedicationsByUserId: jest.Mock;
  };

  let medicationSafetyRouter: {
    route: jest.Mock;
  };

  beforeEach(() => {
    userMedicationRepository = {
      getActiveMedicationsByUserId: jest.fn(),
    };

    medicationSafetyRouter = {
      route: jest.fn(),
    };

    service = new CurrentMedicationRecheckService(
      userMedicationRepository as unknown as UserMedicationRepository,
      medicationSafetyRouter as unknown as MedicationSafetyRouterService,
    );
  });

  it('rechecks every active medication through the authoritative router', async () => {
    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      { id: 10 },
      { id: 20 },
    ]);

    medicationSafetyRouter.route.mockResolvedValue(undefined);

    await service.recheckUser(7);

    expect(
      userMedicationRepository.getActiveMedicationsByUserId,
    ).toHaveBeenCalledWith(7);

    expect(medicationSafetyRouter.route).toHaveBeenNthCalledWith(1, {
      type: 'medication_updated',
      userMedicationId: 10,
    });

    expect(medicationSafetyRouter.route).toHaveBeenNthCalledWith(2, {
      type: 'medication_updated',
      userMedicationId: 20,
    });
  });

  it('does nothing when the user has no active medications', async () => {
    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([]);

    await service.recheckUser(7);

    expect(medicationSafetyRouter.route).not.toHaveBeenCalled();
  });

  it('propagates router failures', async () => {
    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      { id: 10 },
    ]);

    medicationSafetyRouter.route.mockRejectedValue(
      new Error('Safety checker unavailable'),
    );

    await expect(service.recheckUser(7)).rejects.toThrow(
      'Safety checker unavailable',
    );
  });
});
