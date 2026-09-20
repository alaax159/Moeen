import { HttpService } from '@nestjs/axios';
import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';

import { SnomedAllergyResolverService } from './snomed-allergy-resolver.service';

describe('SnomedAllergyResolverService', () => {
  let httpService: {
    get: jest.Mock;
  };

  let configService: {
    getOrThrow: jest.Mock;
  };

  let service: SnomedAllergyResolverService;

  beforeEach(() => {
    httpService = {
      get: jest.fn(),
    };

    configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'SNOMED_FHIR_BASE_URL') {
          return 'https://r4.ontoserver.csiro.au/fhir';
        }

        throw new Error(`Unexpected config key: ${key}`);
      }),
    };

    service = new SnomedAllergyResolverService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  it('resolves a causative agent from the SNOMED normal form', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'property',
              part: [
                {
                  name: 'code',
                  valueCode: 'normalForm',
                },
                {
                  name: 'value',
                  valueString:
                    '=== 91936005|Allergy to penicillin|:{246075003|Causative agent|=(372687004|Amoxicillin|:{726542003|Has disposition|=768681000|Antibacterial|}),719722006|Has realization|=472964009|Allergic process|}',
                },
              ],
            },
          ],
        },
      }),
    );

    const result = await service.getCausativeAgents('294505008');

    expect(httpService.get).toHaveBeenCalledWith(
      'https://r4.ontoserver.csiro.au/fhir/CodeSystem/$lookup',
      {
        params: {
          system: 'http://snomed.info/sct',
          code: '294505008',
          property: 'normalForm',
          _format: 'json',
        },
      },
    );

    expect(result).toEqual([
      {
        snomedId: '372687004',
        name: 'Amoxicillin',
      },
    ]);
  });

  it('supports multiple causative agents', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'property',
              part: [
                {
                  name: 'code',
                  valueCode: 'normalForm',
                },
                {
                  name: 'value',
                  valueString:
                    ':{246075003|Causative agent|=111111|Substance A|,246075003|Causative agent|=(222222|Substance B|)}',
                },
              ],
            },
          ],
        },
      }),
    );

    const result = await service.getCausativeAgents('999999');

    expect(result).toEqual([
      {
        snomedId: '111111',
        name: 'Substance A',
      },
      {
        snomedId: '222222',
        name: 'Substance B',
      },
    ]);
  });

  it('ignores unrelated SNOMED attributes', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'property',
              part: [
                {
                  name: 'code',
                  valueCode: 'normalForm',
                },
                {
                  name: 'value',
                  valueString:
                    ':{363698007|Finding site|=123456|Some finding site|}',
                },
              ],
            },
          ],
        },
      }),
    );

    await expect(
      service.getCausativeAgents('294505008'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('throws when the lookup contains no normal form', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          resourceType: 'Parameters',
          parameter: [],
        },
      }),
    );

    await expect(
      service.getCausativeAgents('294505008'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('throws when no causative agent can be resolved', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'property',
              part: [
                {
                  name: 'code',
                  valueCode: 'normalForm',
                },
                {
                  name: 'value',
                  valueString: '=== 91936005|Allergy to penicillin|',
                },
              ],
            },
          ],
        },
      }),
    );

    await expect(
      service.getCausativeAgents('294505008'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('throws when the SNOMED terminology service is unavailable', async () => {
    httpService.get.mockReturnValue(
      throwError(() => new Error('network failure')),
    );

    await expect(
      service.getCausativeAgents('294505008'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
