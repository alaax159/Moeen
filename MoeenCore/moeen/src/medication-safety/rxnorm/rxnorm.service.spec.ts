import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';

import { RxNormService } from './rxnorm.service';
import { RxNormUnavailableError } from './rxnorm-unavailable.error';

describe('RxNormService', () => {
  let service: RxNormService;
  let httpService: {
    get: jest.Mock;
  };

  beforeEach(() => {
    httpService = {
      get: jest.fn(),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'RXNORM_BASE_URL') {
          return 'https://rxnav.nlm.nih.gov';
        }

        // RXNORM_TIMEOUT_MS unset -> exercises the default (see DEFAULT_RXNORM_TIMEOUT_MS).
        return undefined;
      }),
    };

    service = new RxNormService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  it('resolves a generic name to one RxCUI', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          idGroup: {
            rxnormId: ['161'],
          },
        },
      }),
    );

    const result = await service.resolveMedication('Acetaminophen', 'Tylenol');

    expect(result).toEqual({
      status: 'resolved',
      inputName: 'Acetaminophen',
      rxcui: '161',
    });

    expect(httpService.get).toHaveBeenCalledTimes(1);
  });

  it('falls back to brand name when generic name is not found', async () => {
    httpService.get
      .mockReturnValueOnce(
        of({
          data: {
            idGroup: {},
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            idGroup: {
              rxnormId: ['123'],
            },
          },
        }),
      );

    const result = await service.resolveMedication(
      'Unknown Generic',
      'Known Brand',
    );

    expect(result).toEqual({
      status: 'resolved',
      inputName: 'Known Brand',
      rxcui: '123',
    });

    expect(httpService.get).toHaveBeenCalledTimes(2);
  });

  it('returns ambiguous when multiple RxCUIs remain unresolved', async () => {
    httpService.get
      .mockReturnValueOnce(
        of({
          data: {
            idGroup: {
              rxnormId: ['100', '200'],
            },
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            idGroup: {},
          },
        }),
      );

    const result = await service.resolveMedication(
      'Ambiguous Drug',
      'Unknown Brand',
    );

    expect(result).toEqual({
      status: 'ambiguous',
      inputName: 'Ambiguous Drug',
      rxcuis: ['100', '200'],
    });
  });

  it('returns not_found when neither name resolves', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          idGroup: {},
        },
      }),
    );

    const result = await service.resolveMedication(
      'Unknown Generic',
      'Unknown Brand',
    );

    expect(result).toEqual({
      status: 'not_found',
      inputName: 'Unknown Generic',
    });
  });

  it('does not call RxNorm when no medication name is available', async () => {
    const result = await service.resolveMedication(null, undefined);

    expect(result).toEqual({
      status: 'not_found',
      inputName: null,
    });

    expect(httpService.get).not.toHaveBeenCalled();
  });

  it('uses exact-or-normalized active RxNorm search', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          idGroup: {
            rxnormId: ['161'],
          },
        },
      }),
    );

    await service.findRxCuisByName('Acetaminophen');

    expect(httpService.get).toHaveBeenCalledWith(
      'https://rxnav.nlm.nih.gov/REST/rxcui.json',
      {
        params: {
          name: 'Acetaminophen',
          search: 2,
          allsrc: 0,
        },
        timeout: 8000,
        family: 4,
      },
    );
  });
  it('throws RxNormUnavailableError when the external service fails', async () => {
    httpService.get.mockReturnValue(throwError(() => new Error('timeout')));

    await expect(
      service.findRxCuisByName('Acetaminophen'),
    ).rejects.toBeInstanceOf(RxNormUnavailableError);
  });
  it('resolves an RxCUI to ingredient names', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          relatedGroup: {
            conceptGroup: [
              {
                tty: 'IN',
                conceptProperties: [
                  {
                    rxcui: '161',
                    name: 'acetaminophen',
                    tty: 'IN',
                  },
                ],
              },
            ],
          },
        },
      }),
    );

    const result = await service.getIngredientNames('202433');

    expect(result).toEqual(['acetaminophen']);

    expect(httpService.get).toHaveBeenCalledWith(
      'https://rxnav.nlm.nih.gov/REST/rxcui/202433/related.json',
      {
        params: {
          tty: 'IN',
        },
        timeout: 8000,
        family: 4,
      },
    );
  });

  it('returns the authoritative RxNorm concept for a valid RxCUI', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          properties: {
            rxcui: '161',
            name: 'Acetaminophen',
            tty: 'IN',
          },
        },
      }),
    );

    const result = await service.getConceptByRxcui('161');

    expect(result).toEqual({
      rxcui: '161',
      name: 'Acetaminophen',
      tty: 'IN',
    });

    expect(httpService.get).toHaveBeenCalledWith(
      'https://rxnav.nlm.nih.gov/REST/rxcui/161/properties.json',
      {
        timeout: 8000,
        family: 4,
      },
    );
  });

  it('returns null when the RxCUI does not exist', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {},
      }),
    );

    const result = await service.getConceptByRxcui('999999999');

    expect(result).toBeNull();

    expect(httpService.get).toHaveBeenCalledTimes(1);
  });

  it('rejects a fabricated non-numeric RxCUI without calling RxNorm', async () => {
    const result = await service.getConceptByRxcui('fake-rxcui');

    expect(result).toBeNull();

    expect(httpService.get).not.toHaveBeenCalled();
  });
});
