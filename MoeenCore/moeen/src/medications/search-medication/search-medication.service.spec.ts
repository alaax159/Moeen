import { of, throwError } from 'rxjs';
import { MedicationsService } from './search-medication.service';

describe('MedicationsService search ranking', () => {
  it('keeps source priority and removes weak DailyMed name matches', async () => {
    const databaseRepository = {
      searchMedications: jest.fn().mockResolvedValue([
        {
          id: 7,
          brandName: 'Vitamin C Local',
          genericName: null,
          dailyMedId: null,
          description: null,
          verificationSource: 'dailymed',
          verificationStatus: 'verified',
        },
      ]),
      searchMedicationCatalog: jest.fn().mockResolvedValue([
        {
          id: 11,
          name: 'VITAMIN C STREPSILS ORANGE 100MG',
          manufacturer: 'Example',
          dosageForm: 'Lozenge',
          isEssential: false,
        },
      ]),
    };
    const longWeakName =
      'ADRENAL AZELAIC COPPER CYSTEINE GLUTATHIONE GLYCOLIC ACID VITAMIN C ZINC';
    const httpService = {
      get: jest.fn().mockImplementation((url: string, options: any) => {
        if (url.endsWith('/drugnames.json')) {
          return of({
            data: {
              data: [
                { name_type: 'B', drug_name: longWeakName },
                { name_type: 'B', drug_name: 'AMERIX VITAMIN C' },
              ],
            },
          });
        }

        return of({
          data: {
            data: [
              {
                setid: `set-${options.params.drug_name}`,
                title: options.params.drug_name,
              },
            ],
          },
        });
      }),
    };
    const service = new MedicationsService(
      databaseRepository as never,
      httpService as never,
    );

    const results = await service.search('Vitamin C');

    expect(results.map((result) => result.source)).toEqual([
      'existing_db',
      'palestine_moh',
      'dailymed',
    ]);
    expect(results[2].medication.brandName).toBe('AMERIX VITAMIN C');
    expect(results[0]).toMatchObject({
      verified: 'verified',
      verificationSource: 'dailymed',
      verificationStatus: 'verified',
    });
    expect(
      results.some((result) => result.medication.brandName === longWeakName),
    ).toBe(false);
    expect(results.every((result) => !('relevance' in result))).toBe(true);
  });

  it('returns local sources when DailyMed is unavailable', async () => {
    const databaseRepository = {
      searchMedications: jest.fn().mockResolvedValue([]),
      searchMedicationCatalog: jest.fn().mockResolvedValue([
        {
          id: 12,
          name: 'VITAMIN C 500MG TABLET',
          manufacturer: null,
          dosageForm: 'Tablet',
          isEssential: true,
        },
      ]),
    };
    const httpService = {
      get: jest.fn(() => throwError(() => new Error('offline'))),
    };
    const service = new MedicationsService(
      databaseRepository as never,
      httpService as never,
    );

    const results = await service.search('Vitamin C');

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('palestine_moh');
  });

  it('ranks prefix matches above names that only contain the query mid-word', async () => {
    const databaseRepository = {
      searchMedications: jest.fn().mockResolvedValue([]),
      searchMedicationCatalog: jest.fn().mockResolvedValue([
        {
          id: 1,
          name: 'ATROSPAN OPHTHALMIC DROPS SOLUTION',
          manufacturer: null,
          dosageForm: 'Drops',
          isEssential: false,
        },
        {
          id: 2,
          name: 'BEPANTHEN PLUS CREAM',
          manufacturer: null,
          dosageForm: 'Cream',
          isEssential: false,
        },
        {
          id: 3,
          name: 'CEFAZOLIN PANPHARMA 1G VIAL',
          manufacturer: 'Panpharma',
          dosageForm: 'Vial',
          isEssential: false,
        },
        {
          id: 4,
          name: 'PANADOL EXTRA 500MG TABLET',
          manufacturer: null,
          dosageForm: 'Tablet',
          isEssential: false,
        },
      ]),
    };
    const httpService = {
      get: jest.fn(() => throwError(() => new Error('offline'))),
    };
    const service = new MedicationsService(
      databaseRepository as never,
      httpService as never,
    );

    const results = await service.search('pan');
    const names = results.map((result) => result.medication.brandName);

    // "pan" only appears mid-word in these two, so they are not matches.
    expect(names).not.toContain('ATROSPAN OPHTHALMIC DROPS SOLUTION');
    expect(names).not.toContain('BEPANTHEN PLUS CREAM');
    // The drug whose name starts with the query comes first.
    expect(names[0]).toBe('PANADOL EXTRA 500MG TABLET');
    expect(names).toContain('CEFAZOLIN PANPHARMA 1G VIAL');
  });

  it('pages past the alphabetical window to reach a DailyMed prefix match', async () => {
    const databaseRepository = {
      searchMedications: jest.fn().mockResolvedValue([]),
      searchMedicationCatalog: jest.fn().mockResolvedValue([]),
    };
    // DailyMed orders a substring search alphabetically and caps a page at
    // 100, so "pan" opens on unrelated names and PANADOL sits a page later.
    const pages: Record<number, string[]> = {
      1: ['ATROSPAN OPHTHALMIC SOLUTION', 'BEPANTHEN PLUS CREAM'],
      2: ['PANADOL', 'PANACEA LIFE SCIENCES HAND SANITIZER SPRITZ'],
    };
    const httpService = {
      get: jest.fn().mockImplementation((url: string, options: any) => {
        if (url.endsWith('/drugnames.json')) {
          const page = (options.params.page as number) ?? 1;

          return of({
            data: {
              data: (pages[page] ?? []).map((drug_name) => ({
                name_type: 'B',
                drug_name,
              })),
              metadata: { total_pages: 2 },
            },
          });
        }

        return of({
          data: {
            data: [
              {
                setid: `set-${options.params.drug_name}`,
                title: options.params.drug_name,
              },
            ],
          },
        });
      }),
    };
    const service = new MedicationsService(
      databaseRepository as never,
      httpService as never,
    );

    const results = await service.search('pan');
    const names = results.map((result) => result.medication.brandName);

    // Reached only by requesting the second page.
    expect(names).toContain('PANADOL');
    // The query covers more of PANADOL, so it outranks the longer name it
    // shares a prefix with.
    expect(names[0]).toBe('PANADOL');
    // "pan" falls mid-word in these, so they are not matches -- the same rule
    // the local sources already apply.
    expect(names).not.toContain('ATROSPAN OPHTHALMIC SOLUTION');
    expect(names).not.toContain('BEPANTHEN PLUS CREAM');
  });

  it('stops requesting DailyMed pages when the first one fails', async () => {
    const databaseRepository = {
      searchMedications: jest.fn().mockResolvedValue([]),
      searchMedicationCatalog: jest.fn().mockResolvedValue([]),
    };
    const httpService = {
      get: jest.fn(() => throwError(() => new Error('offline'))),
    };
    const service = new MedicationsService(
      databaseRepository as never,
      httpService as never,
    );

    await expect(service.search('pan')).resolves.toEqual([]);
    expect(httpService.get).toHaveBeenCalledTimes(1);
  });

  it('reports a hand-entered database row as non-verified', async () => {
    const databaseRepository = {
      searchMedications: jest.fn().mockResolvedValue([
        {
          id: 9,
          brandName: 'Panadol',
          genericName: null,
          dailyMedId: null,
          description: null,
          verificationSource: 'manual',
          verificationStatus: 'unresolved',
        },
      ]),
      searchMedicationCatalog: jest.fn().mockResolvedValue([]),
    };
    const httpService = {
      get: jest.fn(() => throwError(() => new Error('offline'))),
    };
    const service = new MedicationsService(
      databaseRepository as never,
      httpService as never,
    );

    const results = await service.search('Panadol');

    expect(results[0]).toMatchObject({
      source: 'existing_db',
      verified: 'non-verified',
      verificationStatus: 'unresolved',
    });
  });

  it('drops a DailyMed candidate already stored in the database', async () => {
    const databaseRepository = {
      searchMedications: jest.fn().mockResolvedValue([
        {
          id: 3,
          brandName: 'PANADOL',
          genericName: null,
          // Stored with the `dm/` prefix DailyMed itself never returns.
          dailyMedId: 'dm/set-PANADOL',
          description: null,
          verificationSource: 'dailymed',
          verificationStatus: 'verified',
        },
      ]),
      searchMedicationCatalog: jest.fn().mockResolvedValue([]),
    };
    const httpService = {
      get: jest.fn().mockImplementation((url: string, options: any) => {
        if (url.endsWith('/drugnames.json')) {
          return of({
            data: { data: [{ name_type: 'B', drug_name: 'PANADOL' }] },
          });
        }

        return of({
          data: {
            data: [
              {
                setid: `set-${options.params.drug_name}`,
                title: options.params.drug_name,
              },
            ],
          },
        });
      }),
    };
    const service = new MedicationsService(
      databaseRepository as never,
      httpService as never,
    );

    const results = await service.search('PANADOL');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      source: 'existing_db',
      verified: 'verified',
    });
  });
});
