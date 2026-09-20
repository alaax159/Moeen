import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { HealthProfileRepository } from '../../database/repository/health-profile.repository';
import { MedicationRepository } from '../../database/repository/medication.repository';
import { UserMedicationRepository } from '../../database/repository/user-medication.repository';
import { DailyMedIngredientService } from './dailymed-ingredient.service';
import { DrugAllergyContextProviderService } from './drug-allergy-context.provider';
import { RxNormSubstanceResolverService } from './rxnorm-substance-resolver.service';
import { SnomedAllergyResolverService } from './snomed-allergy-resolver.service';

describe('DrugAllergyContextProviderService', () => {
  let healthProfileRepository: {
    getActiveAllergiesByUserId: jest.Mock;
  };

  let userMedicationRepository: {
    getSafetyContext: jest.Mock;
  };

  let medicationRepository: {
    getForSafetyCheck: jest.Mock;
  };

  let dailyMedIngredientService: {
    getMedicationAllergens: jest.Mock;
  };

  let snomedAllergyResolverService: {
    getCausativeAgents: jest.Mock;
  };

  let rxNormSubstanceResolverService: {
    getUniiIdentifiersForSnomed: jest.Mock;
    getUniiIdentifiersForRxcui: jest.Mock;
  };

  let service: DrugAllergyContextProviderService;

  beforeEach(() => {
    healthProfileRepository = {
      getActiveAllergiesByUserId: jest.fn(),
    };

    userMedicationRepository = {
      getSafetyContext: jest.fn(),
    };

    medicationRepository = {
      getForSafetyCheck: jest.fn(),
    };

    dailyMedIngredientService = {
      getMedicationAllergens: jest.fn(),
    };

    snomedAllergyResolverService = {
      getCausativeAgents: jest.fn(),
    };

    rxNormSubstanceResolverService = {
      getUniiIdentifiersForSnomed: jest.fn(),
      getUniiIdentifiersForRxcui: jest.fn(),
    };

    service = new DrugAllergyContextProviderService(
      healthProfileRepository as unknown as HealthProfileRepository,
      userMedicationRepository as unknown as UserMedicationRepository,
      medicationRepository as unknown as MedicationRepository,
      dailyMedIngredientService as unknown as DailyMedIngredientService,
      snomedAllergyResolverService as unknown as SnomedAllergyResolverService,
      rxNormSubstanceResolverService as unknown as RxNormSubstanceResolverService,
    );
  });

  it('loads the user and medication context from a user medication id', async () => {
    userMedicationRepository.getSafetyContext.mockResolvedValue({
      userId: 10,
      medicationId: 20,
    });

    const result = await service.getUserMedicationContext(50);

    expect(userMedicationRepository.getSafetyContext).toHaveBeenCalledWith(50);

    expect(result).toEqual({
      userId: 10,
      medicationId: 20,
    });
  });

  it('throws when the user medication does not exist', async () => {
    userMedicationRepository.getSafetyContext.mockResolvedValue(null);

    await expect(service.getUserMedicationContext(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('loads active allergies for the safety event user', async () => {
    healthProfileRepository.getActiveAllergiesByUserId.mockResolvedValue([
      {
        id: 5,
        name: 'Allergy to amoxicillin',
        severity: 'high',
        externalId: '294505008',
      },
    ]);

    const result = await service.getActiveAllergies(10);

    expect(
      healthProfileRepository.getActiveAllergiesByUserId,
    ).toHaveBeenCalledWith(10);

    expect(result).toEqual([
      {
        id: 5,
        name: 'Allergy to amoxicillin',
        severity: 'high',
        externalId: '294505008',
      },
    ]);
  });

  it('loads medication data for the safety check', async () => {
    medicationRepository.getForSafetyCheck.mockResolvedValue({
      id: 20,
      brandName: 'Example Brand',
      genericName: 'Example Generic',
      dailyMedId: 'example-set-id',
    });

    const result = await service.getMedicationForSafetyCheck(20);

    expect(medicationRepository.getForSafetyCheck).toHaveBeenCalledWith(20);

    expect(result).toEqual({
      id: 20,
      brandName: 'Example Brand',
      genericName: 'Example Generic',
      dailyMedId: 'example-set-id',
    });
  });

  it('returns null when the medication does not exist', async () => {
    medicationRepository.getForSafetyCheck.mockResolvedValue(null);

    await expect(service.getMedicationForSafetyCheck(999)).resolves.toBeNull();
  });

  it('loads DailyMed allergens for the medication', async () => {
    medicationRepository.getForSafetyCheck.mockResolvedValue({
      id: 20,
      brandName: 'Example Brand',
      genericName: 'Example Generic',
      dailyMedId: 'example-set-id',
    });

    dailyMedIngredientService.getMedicationAllergens.mockResolvedValue([
      {
        identifier: 'unii:804826J2HU',
        name: 'AMOXICILLIN',
        source: 'drug_ingredient',
      },
      {
        identifier: 'unii:2G86QN327L',
        name: 'GELATIN, UNSPECIFIED',
        source: 'excipient',
      },
    ]);

    const result = await service.getMedicationAllergens(20);

    expect(
      dailyMedIngredientService.getMedicationAllergens,
    ).toHaveBeenCalledWith('example-set-id');

    expect(result).toEqual([
      {
        identifier: 'unii:804826J2HU',
        name: 'AMOXICILLIN',
        source: 'drug_ingredient',
      },
      {
        identifier: 'unii:2G86QN327L',
        name: 'GELATIN, UNSPECIFIED',
        source: 'excipient',
      },
    ]);
  });

  it('throws when the medication does not exist', async () => {
    medicationRepository.getForSafetyCheck.mockResolvedValue(null);

    await expect(service.getMedicationAllergens(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(
      dailyMedIngredientService.getMedicationAllergens,
    ).not.toHaveBeenCalled();
  });

  it('throws when the medication has no DailyMed identifier', async () => {
    medicationRepository.getForSafetyCheck.mockResolvedValue({
      id: 20,
      brandName: null,
      genericName: 'Manual Medication',
      dailyMedId: null,
    });

    await expect(service.getMedicationAllergens(20)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    expect(
      dailyMedIngredientService.getMedicationAllergens,
    ).not.toHaveBeenCalled();
  });

  it('resolves an allergy to normalized UNII identifiers', async () => {
    snomedAllergyResolverService.getCausativeAgents.mockResolvedValue([
      {
        snomedId: '372687004',
        name: 'Amoxicillin',
      },
    ]);

    rxNormSubstanceResolverService.getUniiIdentifiersForSnomed.mockResolvedValue(
      ['unii:804826J2HU'],
    );

    const result = await service.getAllergyMatchIdentifiers({
      id: 1,
      name: 'Allergy to amoxicillin',
      severity: 'high',
      externalId: '294505008',
    });

    expect(
      snomedAllergyResolverService.getCausativeAgents,
    ).toHaveBeenCalledWith('294505008');

    expect(
      rxNormSubstanceResolverService.getUniiIdentifiersForSnomed,
    ).toHaveBeenCalledWith('372687004');

    expect(result).toEqual(['unii:804826J2HU']);
  });

  it('combines identifiers from multiple causative agents without duplicates', async () => {
    snomedAllergyResolverService.getCausativeAgents.mockResolvedValue([
      {
        snomedId: '111111',
        name: 'Substance A',
      },
      {
        snomedId: '222222',
        name: 'Substance B',
      },
    ]);

    rxNormSubstanceResolverService.getUniiIdentifiersForSnomed
      .mockResolvedValueOnce(['unii:AAA111', 'unii:COMMON'])
      .mockResolvedValueOnce(['unii:BBB222', 'unii:COMMON']);

    const result = await service.getAllergyMatchIdentifiers({
      id: 2,
      name: 'Example allergy',
      severity: 'medium',
      externalId: '999999',
    });

    expect(result).toEqual(['unii:AAA111', 'unii:COMMON', 'unii:BBB222']);
  });

  it('returns no identifiers when the allergy has no external identifier', async () => {
    await expect(
      service.getAllergyMatchIdentifiers({
        id: 3,
        name: 'Unknown allergy',
        severity: null,
        externalId: null,
      }),
    ).resolves.toEqual([]);

    expect(
      snomedAllergyResolverService.getCausativeAgents,
    ).not.toHaveBeenCalled();
  });

  it('supports a prefixed SNOMED identifier', async () => {
    snomedAllergyResolverService.getCausativeAgents.mockResolvedValue([
      {
        snomedId: '372687004',
        name: 'Amoxicillin',
      },
    ]);

    rxNormSubstanceResolverService.getUniiIdentifiersForSnomed.mockResolvedValue(
      ['unii:804826J2HU'],
    );

    const result = await service.getAllergyMatchIdentifiers({
      id: 5,
      name: 'Allergy to amoxicillin',
      severity: 'high',
      externalId: 'snomed:294505008',
    });

    expect(
      snomedAllergyResolverService.getCausativeAgents,
    ).toHaveBeenCalledWith('294505008');

    expect(result).toEqual(['unii:804826J2HU']);
  });

  it('resolves a prefixed RxNorm identifier directly through RxNorm', async () => {
    rxNormSubstanceResolverService.getUniiIdentifiersForRxcui.mockResolvedValue([
      'unii:804826J2HU',
    ]);

    await expect(
      service.getAllergyMatchIdentifiers({
        id: 6,
        name: 'Allergy to amoxicillin',
        severity: 'high',
        externalId: 'rxnorm:723',
      }),
    ).resolves.toEqual(['unii:804826J2HU']);

    expect(
      rxNormSubstanceResolverService.getUniiIdentifiersForRxcui,
    ).toHaveBeenCalledWith('723');
    expect(snomedAllergyResolverService.getCausativeAgents).not.toHaveBeenCalled();
  });

  it('returns no identifiers when the allergy has an invalid identifier', async () => {
    await expect(
      service.getAllergyMatchIdentifiers({
        id: 4,
        name: 'Invalid allergy',
        severity: null,
        externalId: 'not-a-snomed-id',
      }),
    ).resolves.toEqual([]);

    expect(
      snomedAllergyResolverService.getCausativeAgents,
    ).not.toHaveBeenCalled();
  });
});
