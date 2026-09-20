import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';

import { HealthProfileRepository } from '../../database/repository/health-profile.repository';
import { MedicalTerminologyService } from './medical-terminology.service';

describe('MedicalTerminologyService', () => {
  let httpService: {
    get: jest.Mock;
  };

  let configService: {
    get: jest.Mock;
  };

  let healthProfileRepository: {
    searchAllergies: jest.Mock;
    searchChronicConditions: jest.Mock;
  };

  let service: MedicalTerminologyService;

  beforeEach(() => {
    httpService = {
      get: jest.fn(),
    };

    configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'CLINICAL_TABLES_BASE_URL') {
          return 'https://clinicaltables.test';
        }

        if (key === 'SNOMED_FHIR_BASE_URL') {
          return 'https://snomed.test/fhir/';
        }

        return fallback;
      }),
    };

    healthProfileRepository = {
      searchAllergies: jest.fn().mockResolvedValue([]),
      searchChronicConditions: jest.fn().mockResolvedValue([]),
    };

    service = new MedicalTerminologyService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
      healthProfileRepository as unknown as HealthProfileRepository,
    );
  });

  it('returns SNOMED allergy results from the SNOMED FHIR server', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          expansion: {
            contains: [
              {
                system: 'http://snomed.info/sct',
                code: '91936005',
                display: 'Allergy to penicillin',
              },
            ],
          },
        },
      }),
    );

    const result = await service.searchAllergies('penicillin');

    expect(result).toEqual([
      {
        id: '91936005',
        externalId: 'snomed:91936005',
        name: 'Allergy to penicillin',
        codeSystem: 'snomed',
        source: 'snomed',
      },
    ]);

    expect(httpService.get).toHaveBeenCalledWith(
      'https://snomed.test/fhir/ValueSet/$expand',
      {
        params: {
          url: 'http://snomed.info/sct?fhir_vs=isa/420134006',
          filter: 'penicillin',
          count: 10,
          activeOnly: true,
          _format: 'json',
        },
        timeout: 8_000,
        family: 4,
      },
    );
  });

  it('ignores invalid SNOMED expansion entries', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          expansion: {
            contains: [
              {
                system: 'http://example.com/not-snomed',
                code: '123',
                display: 'Invalid result',
              },
              {
                system: 'http://snomed.info/sct',
                code: '91936005',
              },
            ],
          },
        },
      }),
    );

    await expect(service.searchAllergies('penicillin')).resolves.toEqual([]);
  });

  it('keeps database allergy results when SNOMED is unavailable', async () => {
    healthProfileRepository.searchAllergies.mockResolvedValue([
      {
        localId: 10,
        externalId: 'snomed:91936005',
        name: 'Allergy to penicillin',
      },
    ]);

    httpService.get.mockReturnValue(
      throwError(() => new Error('SNOMED unavailable')),
    );

    const result = await service.searchAllergies('penicillin');

    expect(result).toEqual([
      {
        id: 'snomed:91936005',
        externalId: 'snomed:91936005',
        name: 'Allergy to penicillin',
        codeSystem: 'snomed',
        source: 'existing_db',
      },
    ]);
  });

  it('filters legacy UMLS allergy identifiers from database search results', async () => {
    healthProfileRepository.searchAllergies.mockResolvedValue([
      {
        localId: 10,
        externalId: 'umls:C123456',
        name: 'Historical allergy',
      },
    ]);

    httpService.get.mockReturnValue(
      of({
        data: {
          expansion: {
            contains: [],
          },
        },
      }),
    );

    const result = await service.searchAllergies('historical');

    expect(result).toEqual([]);
  });

  it('filters legacy RxNorm allergy identifiers from database search results', async () => {
    healthProfileRepository.searchAllergies.mockResolvedValue([
      {
        localId: 11,
        externalId: 'rxnorm:12345',
        name: 'Legacy allergy',
      },
    ]);

    httpService.get.mockReturnValue(
      of({
        data: {
          expansion: {
            contains: [],
          },
        },
      }),
    );

    const result = await service.searchAllergies('legacy');

    expect(result).toEqual([]);
  });

  it('filters legacy identifiers from chronic condition database search results', async () => {
    healthProfileRepository.searchChronicConditions.mockResolvedValue([
      {
        localId: 20,
        externalId: 'umls:C999999',
        name: 'Historical condition',
      },
      {
        localId: 21,
        externalId: 'snomed:123456',
        name: 'Valid SNOMED condition',
      },
    ]);

    httpService.get.mockReturnValue(
      of({
        data: [0, [], null, []],
      }),
    );

    const result = await service.searchChronicConditions('condition');

    expect(result).toEqual([
      {
        id: 'snomed:123456',
        externalId: 'snomed:123456',
        name: 'Valid SNOMED condition',
        codeSystem: 'snomed',
        source: 'existing_db',
      },
    ]);
  });
});
