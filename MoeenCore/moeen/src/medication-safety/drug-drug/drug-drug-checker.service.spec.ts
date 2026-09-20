import { NotFoundException } from '@nestjs/common';

import type { MedicationSafetyEvent } from '../medication-safety.contracts';
import { RxNormUnavailableError } from '../rxnorm/rxnorm-unavailable.error';
import { DrugDrugCheckerService } from './drug-drug-checker.service';

describe('DrugDrugCheckerService', () => {
  let userMedicationRepository: {
    getMedicationSafetyContext: jest.Mock;
    getActiveMedicationsByUserId: jest.Mock;
  };

  let rxNormService: {
    resolveMedication: jest.Mock;
  };

  let interactionProvider: {
    checkInteraction: jest.Mock;
  };

  let service: DrugDrugCheckerService;

  beforeEach(() => {
    userMedicationRepository = {
      getMedicationSafetyContext: jest.fn(),
      getActiveMedicationsByUserId: jest.fn(),
    };

    rxNormService = {
      resolveMedication: jest.fn(),
    };

    interactionProvider = {
      checkInteraction: jest.fn(),
    };

    service = new DrugDrugCheckerService(
      userMedicationRepository as never,
      rxNormService as never,
      interactionProvider,
    );
  });

  const event: MedicationSafetyEvent = {
    type: 'medication_added',
    userMedicationId: 10,
  };

  const targetMedication = {
    userMedicationId: 10,
    userId: 5,
    medicationId: 100,
    brandName: 'Drug A Brand',
    genericName: 'Drug A',
  };

  const otherMedication = {
    id: 20,
    medicationId: 200,
    brandName: 'Drug B Brand',
    genericName: 'Drug B',
  };

  it('throws when the target user medication does not exist', async () => {
    userMedicationRepository.getMedicationSafetyContext.mockResolvedValue(
      undefined,
    );

    await expect(service.check(event)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns no warnings when there are no other active medications', async () => {
    userMedicationRepository.getMedicationSafetyContext.mockResolvedValue(
      targetMedication,
    );

    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      {
        id: 10,
        medicationId: 100,
        brandName: 'Drug A Brand',
        genericName: 'Drug A',
      },
    ]);

    rxNormService.resolveMedication.mockResolvedValue({
      status: 'resolved',
      inputName: 'Drug A',
      rxcui: '1000',
    });

    await expect(service.check(event)).resolves.toEqual([]);

    expect(interactionProvider.checkInteraction).not.toHaveBeenCalled();
  });

  it('returns no warning when the provider finds no interaction', async () => {
    userMedicationRepository.getMedicationSafetyContext.mockResolvedValue(
      targetMedication,
    );

    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      {
        id: 10,
        medicationId: 100,
        brandName: 'Drug A Brand',
        genericName: 'Drug A',
      },
      otherMedication,
    ]);

    rxNormService.resolveMedication
      .mockResolvedValueOnce({
        status: 'resolved',
        inputName: 'Drug A',
        rxcui: '1000',
      })
      .mockResolvedValueOnce({
        status: 'resolved',
        inputName: 'Drug B',
        rxcui: '2000',
      });

    interactionProvider.checkInteraction.mockResolvedValue(null);

    await expect(service.check(event)).resolves.toEqual([]);

    expect(interactionProvider.checkInteraction).toHaveBeenCalledWith(
      {
        rxcui: '1000',
        name: 'Drug A',
      },
      {
        rxcui: '2000',
        name: 'Drug B',
      },
    );
  });

  it('uses the draft RxCUI directly without resolving the target medication name again', async () => {
    const draftEvent: MedicationSafetyEvent = {
      type: 'medication_precheck',
      draft: {
        userId: 5,
        medicationId: null,
        dailyMedId: null,
        rxcui: '1000',
        brandName: 'Drug A Brand',
        genericName: 'Drug A',
        verificationSource: 'rxnorm',
        verificationStatus: 'verified',
      },
    };

    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      otherMedication,
    ]);

    rxNormService.resolveMedication.mockResolvedValue({
      status: 'resolved',
      inputName: 'Drug B',
      rxcui: '2000',
    });

    interactionProvider.checkInteraction.mockResolvedValue(null);

    await expect(service.check(draftEvent)).resolves.toEqual([]);

    expect(rxNormService.resolveMedication).toHaveBeenCalledTimes(1);

    expect(rxNormService.resolveMedication).toHaveBeenCalledWith(
      'Drug B',
      'Drug B Brand',
    );

    expect(interactionProvider.checkInteraction).toHaveBeenCalledWith(
      {
        rxcui: '1000',
        name: 'Drug A',
      },
      {
        rxcui: '2000',
        name: 'Drug B',
      },
    );

    expect(
      userMedicationRepository.getMedicationSafetyContext,
    ).not.toHaveBeenCalled();
  });

  it('returns a drug-drug warning when an interaction exists', async () => {
    userMedicationRepository.getMedicationSafetyContext.mockResolvedValue(
      targetMedication,
    );

    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      {
        id: 10,
        medicationId: 100,
        brandName: 'Drug A Brand',
        genericName: 'Drug A',
      },
      otherMedication,
    ]);

    rxNormService.resolveMedication
      .mockResolvedValueOnce({
        status: 'resolved',
        inputName: 'Drug A',
        rxcui: '1000',
      })
      .mockResolvedValueOnce({
        status: 'resolved',
        inputName: 'Drug B',
        rxcui: '2000',
      });

    interactionProvider.checkInteraction.mockResolvedValue({
      severity: 'major',
      message: 'Drug A interacts with Drug B.',
    });

    await expect(service.check(event)).resolves.toEqual([
      {
        warningType: 'drug_drug',
        severity: 'major',
        message: 'Drug A interacts with Drug B.',
        subjectUserMedicationIds: [10, 20],
      },
    ]);
  });

  it('returns an unknown warning when the target medication cannot be normalized', async () => {
    userMedicationRepository.getMedicationSafetyContext.mockResolvedValue(
      targetMedication,
    );

    rxNormService.resolveMedication.mockResolvedValue({
      status: 'not_found',
      inputName: 'Drug A',
    });

    const result = await service.check(event);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      warningType: 'drug_drug',
      severity: 'unknown',
    });

    expect(interactionProvider.checkInteraction).not.toHaveBeenCalled();
  });

  it('fails safely when RxNorm is unavailable', async () => {
    userMedicationRepository.getMedicationSafetyContext.mockResolvedValue(
      targetMedication,
    );

    rxNormService.resolveMedication.mockRejectedValue(
      new RxNormUnavailableError('Drug A'),
    );

    const result = await service.check(event);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      warningType: 'drug_drug',
      severity: 'unknown',
    });

    expect(interactionProvider.checkInteraction).not.toHaveBeenCalled();
  });

  it('checks the same medication concept only once', async () => {
    userMedicationRepository.getMedicationSafetyContext.mockResolvedValue(
      targetMedication,
    );

    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      {
        id: 10,
        medicationId: 100,
        brandName: 'Drug A Brand',
        genericName: 'Drug A',
      },
      otherMedication,
      {
        ...otherMedication,
        id: 21,
      },
    ]);

    rxNormService.resolveMedication
      .mockResolvedValueOnce({
        status: 'resolved',
        inputName: 'Drug A',
        rxcui: '1000',
      })
      .mockResolvedValueOnce({
        status: 'resolved',
        inputName: 'Drug B',
        rxcui: '2000',
      });

    interactionProvider.checkInteraction.mockResolvedValue(null);

    await service.check(event);

    expect(interactionProvider.checkInteraction).toHaveBeenCalledTimes(1);
  });
});
