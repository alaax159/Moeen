import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { MedicationSafetyEvent } from '../medication-safety.contracts';
import { RxNormUnavailableError } from '../rxnorm/rxnorm-unavailable.error';
import { DrugConditionChecker } from './drug-condition.checker';

describe('DrugConditionChecker', () => {
  let interactionProvider: {
    checkInteraction: jest.Mock;
  };
  let safetyWarningRepository: {
    getMedicationContext: jest.Mock;
    getActiveChronicConditions: jest.Mock;
  };
  let rxNormService: {
    resolveMedication: jest.Mock;
  };
  let checker: DrugConditionChecker;

  const event: MedicationSafetyEvent = {
    type: 'medication_added',
    userMedicationId: 10,
  };

  beforeEach(() => {
    interactionProvider = {
      checkInteraction: jest.fn(),
    };
    safetyWarningRepository = {
      getMedicationContext: jest.fn(),
      getActiveChronicConditions: jest.fn(),
    };
    rxNormService = {
      resolveMedication: jest.fn(),
    };
    checker = new DrugConditionChecker(
      interactionProvider,
      safetyWarningRepository as never,
      rxNormService as never,
    );
  });

  it('throws when the target user medication does not exist', async () => {
    safetyWarningRepository.getMedicationContext.mockResolvedValue(undefined);

    await expect(checker.check(event)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws when the medication has no searchable name', async () => {
    safetyWarningRepository.getMedicationContext.mockResolvedValue({
      userId: 5,
      brandName: null,
      genericName: null,
    });
    safetyWarningRepository.getActiveChronicConditions.mockResolvedValue([]);

    await expect(checker.check(event)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('returns no warnings when the user has no active conditions', async () => {
    safetyWarningRepository.getMedicationContext.mockResolvedValue({
      userId: 5,
      brandName: 'Drug Brand',
      genericName: 'Drug',
    });
    safetyWarningRepository.getActiveChronicConditions.mockResolvedValue([]);

    await expect(checker.check(event)).resolves.toEqual([]);
    expect(rxNormService.resolveMedication).not.toHaveBeenCalled();
    expect(interactionProvider.checkInteraction).not.toHaveBeenCalled();
  });

  it('returns warnings for interactions found for active conditions', async () => {
    safetyWarningRepository.getMedicationContext.mockResolvedValue({
      userId: 5,
      brandName: 'Drug Brand',
      genericName: 'Drug',
    });
    safetyWarningRepository.getActiveChronicConditions.mockResolvedValue([
      {
        id: 1,
        name: 'Asthma',
        externalId: 'J45.909',
      },
    ]);
    rxNormService.resolveMedication.mockResolvedValue({
      status: 'resolved',
      inputName: 'Drug',
      rxcui: '123',
    });
    interactionProvider.checkInteraction.mockResolvedValue({
      interacts: true,
      severity: 'moderate',
      message: 'The drug label mentions asthma in warnings',
      source: 'openfda',
    });

    await expect(checker.check(event)).resolves.toEqual([
      {
        warningType: 'drug_condition',
        severity: 'moderate',
        message: 'The drug label mentions asthma in warnings',
        affected: 'Asthma',
        subjectUserMedicationIds: [10],
        subjectUserConditionId: 1,
        evidence: [
          expect.objectContaining({
            source: 'openfda',
            sourceRecordId: 'J45.909',
          }),
        ],
      },
    ]);
    expect(interactionProvider.checkInteraction).toHaveBeenCalledWith({
      medicationName: 'Drug',
      rxcui: '123',
      conditionName: 'Asthma',
    });
  });

  it('uses the draft RxCUI directly without resolving the medication name again', async () => {
    const draftEvent: MedicationSafetyEvent = {
      type: 'medication_precheck',
      draft: {
        userId: 5,
        medicationId: null,
        dailyMedId: null,
        rxcui: '161',
        brandName: 'Tylenol',
        genericName: 'Acetaminophen',
        verificationSource: 'rxnorm',
        verificationStatus: 'verified',
      },
    };

    safetyWarningRepository.getActiveChronicConditions.mockResolvedValue([
      {
        id: 1,
        name: 'Asthma',
        externalId: 'J45.909',
      },
    ]);

    interactionProvider.checkInteraction.mockResolvedValue({
      interacts: true,
      severity: 'moderate',
      message: 'Example interaction',
      source: 'openfda',
    });

    await checker.check(draftEvent);

    expect(rxNormService.resolveMedication).not.toHaveBeenCalled();

    expect(interactionProvider.checkInteraction).toHaveBeenCalledWith({
      medicationName: 'Acetaminophen',
      rxcui: '161',
      conditionName: 'Asthma',
    });

    expect(safetyWarningRepository.getMedicationContext).not.toHaveBeenCalled();
  });

  it('falls back to the medication name when RxNorm is unavailable', async () => {
    safetyWarningRepository.getMedicationContext.mockResolvedValue({
      userId: 5,
      brandName: 'Drug Brand',
      genericName: 'Drug',
    });
    safetyWarningRepository.getActiveChronicConditions.mockResolvedValue([
      {
        id: 1,
        name: 'Asthma',
        externalId: 'J45.909',
      },
    ]);
    rxNormService.resolveMedication.mockRejectedValue(
      new RxNormUnavailableError('Drug'),
    );
    interactionProvider.checkInteraction.mockResolvedValue({
      interacts: null,
      severity: 'unknown',
      message: 'Unable to verify the interaction',
      source: 'openfda',
    });

    await expect(checker.check(event)).resolves.toEqual([
      {
        warningType: 'drug_condition',
        severity: 'unknown',
        message: 'Unable to verify the interaction',
        affected: 'Asthma',
        subjectUserMedicationIds: [10],
        subjectUserConditionId: 1,
        evidence: [
          expect.objectContaining({
            source: 'openfda',
            sourceRecordId: 'J45.909',
          }),
        ],
      },
    ]);
    expect(interactionProvider.checkInteraction).toHaveBeenCalledWith({
      medicationName: 'Drug',
      rxcui: undefined,
      conditionName: 'Asthma',
    });
  });
});
