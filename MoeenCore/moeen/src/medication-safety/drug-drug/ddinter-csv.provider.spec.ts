import { ConfigService } from '@nestjs/config';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RxNormService } from '../rxnorm/rxnorm.service';
import { DdinterCsvProvider } from './ddinter-csv.provider';

describe('DdinterCsvProvider', () => {
  let dataDir: string;

  let configService: {
    get: jest.Mock;
  };

  let rxNormService: {
    getIngredientNames: jest.Mock;
  };

  let provider: DdinterCsvProvider;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'ddinter-test-'));

    await writeFile(
      join(dataDir, 'ddinter_downloads_code_A.csv'),
      [
        'DDInterID_A,Drug_A,DDInterID_B,Drug_B,Level',
        'DDInter1263,Naltrexone,DDInter1,Abacavir,Moderate',
        'DDInter2,Drug One,DDInter3,Drug Two,Minor',
        'DDInter2,Drug One,DDInter4,Drug Three,Major',
        'DDInter5,Drug Four,DDInter6,Drug Five,Unknown',
      ].join('\n'),
      'utf8',
    );

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'DDINTER_DATA_DIR') {
          return dataDir;
        }

        return undefined;
      }),
    };

    rxNormService = {
      getIngredientNames: jest.fn(),
    };

    provider = new DdinterCsvProvider(
      configService as unknown as ConfigService,
      rxNormService as unknown as RxNormService,
    );
  });

  afterEach(async () => {
    await rm(dataDir, {
      recursive: true,
      force: true,
    });
  });

  it('finds a known DDInter interaction', async () => {
    rxNormService.getIngredientNames
      .mockResolvedValueOnce(['Naltrexone'])
      .mockResolvedValueOnce(['Abacavir']);

    await expect(
      provider.checkInteraction(
        {
          rxcui: '1',
          name: 'Naltrexone',
        },
        {
          rxcui: '2',
          name: 'Abacavir',
        },
      ),
    ).resolves.toEqual({
      severity: 'moderate',
      message:
        'DDInter interaction level between Naltrexone and Abacavir: Moderate.',
    });
  });

  it('matches a drug pair regardless of order', async () => {
    rxNormService.getIngredientNames
      .mockResolvedValueOnce(['Abacavir'])
      .mockResolvedValueOnce(['Naltrexone']);

    const result = await provider.checkInteraction(
      {
        rxcui: '1',
        name: 'Abacavir',
      },
      {
        rxcui: '2',
        name: 'Naltrexone',
      },
    );

    expect(result?.severity).toBe('moderate');
  });

  it('returns null when no DDInter interaction exists', async () => {
    rxNormService.getIngredientNames
      .mockResolvedValueOnce(['Naltrexone'])
      .mockResolvedValueOnce(['Unrelated Drug']);

    await expect(
      provider.checkInteraction(
        {
          rxcui: '1',
          name: 'Naltrexone',
        },
        {
          rxcui: '2',
          name: 'Unrelated Drug',
        },
      ),
    ).resolves.toBeNull();
  });

  it('preserves DDInter Unknown as an unknown warning', async () => {
    rxNormService.getIngredientNames
      .mockResolvedValueOnce(['Drug Four'])
      .mockResolvedValueOnce(['Drug Five']);

    const result = await provider.checkInteraction(
      {
        rxcui: '4',
        name: 'Drug Four',
      },
      {
        rxcui: '5',
        name: 'Drug Five',
      },
    );

    expect(result?.severity).toBe('unknown');
  });

  it('selects the strongest interaction for combination drugs', async () => {
    rxNormService.getIngredientNames
      .mockResolvedValueOnce(['Drug One'])
      .mockResolvedValueOnce(['Drug Two', 'Drug Three']);

    const result = await provider.checkInteraction(
      {
        rxcui: '1',
        name: 'Drug One',
      },
      {
        rxcui: '2',
        name: 'Combination Drug',
      },
    );

    expect(result?.severity).toBe('major');
  });

  it('fails safely when an ingredient cannot be resolved', async () => {
    rxNormService.getIngredientNames
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['Abacavir']);

    const result = await provider.checkInteraction(
      {
        rxcui: '1',
        name: 'Unknown Drug',
      },
      {
        rxcui: '2',
        name: 'Abacavir',
      },
    );

    expect(result).toMatchObject({
      severity: 'unknown',
    });
  });
  it('retries loading DDInter data after an initial load failure', async () => {
    await rm(dataDir, {
      recursive: true,
      force: true,
    });

    rxNormService.getIngredientNames
      .mockResolvedValueOnce(['Naltrexone'])
      .mockResolvedValueOnce(['Abacavir'])
      .mockResolvedValueOnce(['Naltrexone'])
      .mockResolvedValueOnce(['Abacavir']);

    const firstResult = await provider.checkInteraction(
      {
        rxcui: '1',
        name: 'Naltrexone',
      },
      {
        rxcui: '2',
        name: 'Abacavir',
      },
    );

    expect(firstResult).toMatchObject({
      severity: 'unknown',
    });

    await mkdir(dataDir, {
      recursive: true,
    });

    await writeFile(
      join(dataDir, 'ddinter_downloads_code_A.csv'),
      [
        'DDInterID_A,Drug_A,DDInterID_B,Drug_B,Level',
        'DDInter1263,Naltrexone,DDInter1,Abacavir,Moderate',
      ].join('\n'),
      'utf8',
    );

    const secondResult = await provider.checkInteraction(
      {
        rxcui: '1',
        name: 'Naltrexone',
      },
      {
        rxcui: '2',
        name: 'Abacavir',
      },
    );

    expect(secondResult).toMatchObject({
      severity: 'moderate',
    });
  });
});
