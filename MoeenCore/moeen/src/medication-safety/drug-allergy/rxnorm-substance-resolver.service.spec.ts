import { HttpService } from '@nestjs/axios';
import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';

import { RxNormSubstanceResolverService } from './rxnorm-substance-resolver.service';

describe('RxNormSubstanceResolverService', () => {
  let httpService: {
    get: jest.Mock;
  };

  let configService: {
    get: jest.Mock;
  };

  let service: RxNormSubstanceResolverService;

  beforeEach(() => {
    httpService = {
      get: jest.fn(),
    };

    configService = {
      get: jest.fn().mockReturnValue('https://rxnav.nlm.nih.gov'),
    };

    service = new RxNormSubstanceResolverService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  it('resolves a SNOMED substance to a UNII identifier', async () => {
    httpService.get
      .mockReturnValueOnce(
        of({
          data: {
            idGroup: {
              rxnormId: ['723'],
            },
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            propConceptGroup: {
              propConcept: [
                {
                  propName: 'UNII_CODE',
                  propValue: '804826J2HU',
                },
              ],
            },
          },
        }),
      );

    const result = await service.getUniiIdentifiersForSnomed('372687004');

    expect(httpService.get).toHaveBeenNthCalledWith(
      1,
      'https://rxnav.nlm.nih.gov/REST/rxcui.json',
      {
        params: {
          idtype: 'SNOMEDCT',
          id: '372687004',
          allsrc: 0,
        },
      },
    );

    expect(httpService.get).toHaveBeenNthCalledWith(
      2,
      'https://rxnav.nlm.nih.gov/REST/rxcui/723/property.json',
      {
        params: {
          propName: 'UNII_CODE',
        },
      },
    );

    expect(result).toEqual(['unii:804826J2HU']);
  });

  it('supports multiple RxCUIs and removes duplicate UNIIs', async () => {
    httpService.get
      .mockReturnValueOnce(
        of({
          data: {
            idGroup: {
              rxnormId: ['111', '222', '222'],
            },
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            propConceptGroup: {
              propConcept: [
                {
                  propName: 'UNII_CODE',
                  propValue: 'AAA111',
                },
              ],
            },
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            propConceptGroup: {
              propConcept: [
                {
                  propName: 'UNII_CODE',
                  propValue: 'AAA111',
                },
                {
                  propName: 'UNII_CODE',
                  propValue: 'BBB222',
                },
              ],
            },
          },
        }),
      );

    const result = await service.getUniiIdentifiersForSnomed('999999');

    expect(result).toEqual(['unii:AAA111', 'unii:BBB222']);
  });

  it('throws when SNOMED has no RxNorm mapping', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          idGroup: {},
        },
      }),
    );

    await expect(
      service.getUniiIdentifiersForSnomed('999999'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('throws when an RxCUI has no UNII mapping', async () => {
    httpService.get
      .mockReturnValueOnce(
        of({
          data: {
            idGroup: {
              rxnormId: ['723'],
            },
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            propConceptGroup: {},
          },
        }),
      );

    await expect(
      service.getUniiIdentifiersForSnomed('372687004'),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('resolves a known RxCUI directly to a UNII identifier', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          propConceptGroup: {
            propConcept: [
              { propName: 'UNII_CODE', propValue: '804826J2HU' },
            ],
          },
        },
      }),
    );

    await expect(
      service.getUniiIdentifiersForRxcui('723'),
    ).resolves.toEqual(['unii:804826J2HU']);

    expect(httpService.get).toHaveBeenCalledWith(
      'https://rxnav.nlm.nih.gov/REST/rxcui/723/property.json',
      { params: { propName: 'UNII_CODE' } },
    );
  });

  it('throws when the RxNorm lookup service is unavailable', async () => {
    httpService.get.mockReturnValue(
      throwError(() => new Error('network failure')),
    );

    await expect(
      service.getUniiIdentifiersForSnomed('372687004'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws when the RxNorm property service is unavailable', async () => {
    httpService.get
      .mockReturnValueOnce(
        of({
          data: {
            idGroup: {
              rxnormId: ['723'],
            },
          },
        }),
      )
      .mockReturnValueOnce(throwError(() => new Error('network failure')));

    await expect(
      service.getUniiIdentifiersForSnomed('372687004'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
