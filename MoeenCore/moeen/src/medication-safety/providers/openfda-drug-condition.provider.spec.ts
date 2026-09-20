import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

import { OpenFdaDrugConditionProvider } from './openfda-drug-condition.provider';

describe('OpenFdaDrugConditionProvider', () => {
  let httpService: {
    get: jest.Mock;
  };
  let provider: OpenFdaDrugConditionProvider;

  const getSearchParameter = (callIndex: number) => {
    const calls = httpService.get.mock.calls as unknown as Array<
      [string, { params: { search: string } }]
    >;

    return calls[callIndex][1].params.search;
  };

  beforeEach(() => {
    httpService = {
      get: jest.fn(),
    };
    provider = new OpenFdaDrugConditionProvider(
      httpService as unknown as HttpService,
    );
  });

  it.each([
    '2, 17) • Bronchospasm: Avoid use in patients with asthma or lower respiratory infection (4, 5',
    'Bronchospasm: Avoid use in patients with asthma or lower respiratory infection (4, 5).',
  ])(
    'cleans label references and headings without changing the risk: %s',
    async (text) => {
      httpService.get.mockReturnValue(
        of({ data: { results: [{ warnings: [text] }] } }),
      );
      await expect(
        provider.checkInteraction({
          medicationName: 'PROPRANOLOL',
          conditionName: 'Asthma',
        }),
      ).resolves.toMatchObject({
        interacts: true,
        severity: 'major',
        message:
          'PROPRANOLOL: Avoid use in patients with asthma or lower respiratory infection.',
      });
    },
  );

  it('preserves clinical qualifiers in the displayed risk', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          results: [
            {
              warnings: [
                'Use with caution in patients with asthma (including a history of bronchospasm) [4, 5].',
              ],
            },
          ],
        },
      }),
    );
    await expect(
      provider.checkInteraction({
        medicationName: 'Drug',
        conditionName: 'Asthma',
      }),
    ).resolves.toMatchObject({
      severity: 'moderate',
      message:
        'Drug: Use with caution in patients with asthma (including a history of bronchospasm).',
    });
  });

  it.each([
    [
      'contraindications',
      'Patients with asthma were included in the warfarin study.',
    ],
    [
      'boxed_warning',
      'Avoid use in patients with active bleeding. Asthma was recorded in the medical history.',
    ],
    [
      'warnings',
      'Use with caution in patients with liver disease; asthma was reported at baseline.',
    ],
    [
      'warnings',
      'Asthma was recorded in patients who had an increased risk of bleeding.',
    ],
    ['warnings', 'Warfarin is not contraindicated in patients with asthma.'],
    ['warnings', 'There is no increased risk of asthma.'],
    ['warnings', 'No evidence that warfarin may worsen asthma.'],
    ['warnings', 'Use with caution in patients with asthma-like symptoms.'],
  ])(
    'does not warn for neutral, unrelated or negated context in %s: %s',
    async (section, text) => {
      httpService.get.mockReturnValue(
        of({ data: { results: [{ [section]: [text] }] } }),
      );
      await expect(
        provider.checkInteraction({
          medicationName: 'Warfarin',
          conditionName: 'Asthma',
        }),
      ).resolves.toMatchObject({ interacts: false, severity: 'none' });
    },
  );

  it.each([
    ['Contraindicated in patients with asthma.', 'contraindicated'],
    ['Use with caution in patients with asthma.', 'moderate'],
    ['Avoid use in patients with asthma.', 'major'],
    ['Not recommended in patients with asthma.', 'major'],
    ['This drug may worsen asthma.', 'moderate'],
    ['There is an increased risk in patients with asthma.', 'moderate'],
    [
      'This drug should not be used in patients with asthma.',
      'contraindicated',
    ],
  ])('requires explicit risk language: %s', async (text, severity) => {
    httpService.get.mockReturnValue(
      of({ data: { results: [{ warnings: [text] }] } }),
    );
    await expect(
      provider.checkInteraction({
        medicationName: 'Drug',
        conditionName: 'Asthma',
      }),
    ).resolves.toMatchObject({ interacts: true, severity });
  });

  it('does not borrow risk language from another label or array item', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          results: [
            {
              contraindications: [
                'Contraindicated in patients with',
                'Asthma was recorded at baseline',
              ],
            },
            { warnings: ['Asthma'] },
          ],
        },
      }),
    );
    await expect(
      provider.checkInteraction({
        medicationName: 'Warfarin',
        conditionName: 'Asthma',
      }),
    ).resolves.toMatchObject({ interacts: false, severity: 'none' });
  });

  it('treats a terse condition listed in contraindications as contraindicated', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          results: [{ contraindications: ['Bronchial asthma'] }],
        },
      }),
    );

    await expect(
      provider.checkInteraction({
        medicationName: 'Propranolol',
        conditionName: 'Asthma',
      }),
    ).resolves.toMatchObject({
      interacts: true,
      severity: 'contraindicated',
    });
  });

  it('returns unverified when labels contain no usable safety text', async () => {
    httpService.get.mockReturnValue(of({ data: { results: [{}] } }));
    await expect(
      provider.checkInteraction({
        medicationName: 'Drug',
        conditionName: 'Asthma',
      }),
    ).resolves.toMatchObject({ interacts: null, severity: 'unknown' });
  });

  it('checks warnings and cautions returned by openFDA', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          results: [
            {
              warnings_and_cautions: ['Use carefully in patients with asthma.'],
            },
          ],
        },
      }),
    );

    await expect(
      provider.checkInteraction({
        medicationName: 'Drug',
        conditionName: 'Asthma',
      }),
    ).resolves.toMatchObject({
      interacts: true,
      severity: 'moderate',
      source: 'openfda',
    });
  });

  it('matches an ICD-10-CM style condition name against plain clinical label wording', async () => {
    // Real-world label text uses plain clinical language ("bronchial
    // asthma"), while stored conditions are often ICD-10-CM display names
    // ("Unspecified asthma, uncomplicated"). The qualifier words around
    // the core disease term must not prevent a match.
    httpService.get.mockReturnValue(
      of({
        data: {
          results: [
            {
              contraindications: [
                'Contraindicated in patients with bronchial asthma; sinus bradycardia.',
              ],
            },
          ],
        },
      }),
    );

    await expect(
      provider.checkInteraction({
        medicationName: 'Propranolol',
        conditionName: 'Unspecified asthma, uncomplicated',
      }),
    ).resolves.toMatchObject({
      interacts: true,
      severity: 'contraindicated',
    });
  });

  it('does not flag an interaction when every matching label was searched and no mention was found', async () => {
    // A real label was retrieved (not a network failure, not a missing
    // label) and none of its sections mention the condition — this must
    // be a conclusive "no interaction", not a false-positive warning.
    // meta.results.total matches the number of labels returned, so the
    // search was exhaustive.
    httpService.get.mockReturnValue(
      of({
        data: {
          meta: { results: { total: 1 } },
          results: [
            {
              contraindications: ['None known.'],
              warnings: ['Consult a doctor if pregnant.'],
            },
          ],
        },
      }),
    );

    await expect(
      provider.checkInteraction({
        medicationName: 'Vitamin D',
        conditionName: 'Asthma',
      }),
    ).resolves.toEqual({
      interacts: false,
      severity: 'none',
      message:
        'No explicit interaction between Vitamin D and Asthma was found in the retrieved label sections',
      source: 'openfda',
    });
  });

  it('checks precautions and general_precautions sections too', async () => {
    // Safety-relevant text can live in these sections as well; skipping
    // them would let a real mention slip through and be silently
    // resolved as "no interaction".
    httpService.get.mockReturnValue(
      of({
        data: {
          results: [
            {
              precautions: ['Use caution in patients with asthma.'],
            },
          ],
        },
      }),
    );

    await expect(
      provider.checkInteraction({
        medicationName: 'Drug',
        conditionName: 'Asthma',
      }),
    ).resolves.toMatchObject({
      interacts: true,
      severity: 'moderate',
    });
  });

  it('finds a warning on a later openFDA page', async () => {
    httpService.get
      .mockReturnValueOnce(
        of({
          data: {
            meta: { results: { total: 101 } },
            results: Array.from({ length: 100 }, () => ({
              contraindications: ['None known.'],
            })),
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            meta: { results: { total: 101 } },
            results: [{ contraindications: ['Contraindicated in asthma.'] }],
          },
        }),
      );

    await expect(
      provider.checkInteraction({
        medicationName: 'Propranolol',
        conditionName: 'Asthma',
      }),
    ).resolves.toMatchObject({
      interacts: true,
      severity: 'contraindicated',
    });

    expect(httpService.get).toHaveBeenCalledTimes(2);
    const calls = httpService.get.mock.calls as unknown as Array<
      [string, { params: { skip: number } }]
    >;
    expect(calls[1][1].params.skip).toBe(100);
  });

  it('continues after a short page when openFDA reports more results', async () => {
    httpService.get
      .mockReturnValueOnce(
        of({
          data: {
            meta: { results: { total: 250 } },
            results: Array.from({ length: 100 }, () => ({
              contraindications: ['None known.'],
            })),
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            meta: { results: { total: 250 } },
            results: Array.from({ length: 50 }, () => ({
              contraindications: ['None known.'],
            })),
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            meta: { results: { total: 250 } },
            results: [
              { contraindications: ['Contraindicated in asthma.'] },
              ...Array.from({ length: 99 }, () => ({
                contraindications: ['None known.'],
              })),
            ],
          },
        }),
      );

    await expect(
      provider.checkInteraction({
        medicationName: 'Propranolol',
        conditionName: 'Asthma',
      }),
    ).resolves.toMatchObject({
      interacts: true,
      severity: 'contraindicated',
    });

    expect(httpService.get).toHaveBeenCalledTimes(3);
    const calls = httpService.get.mock.calls as unknown as Array<
      [string, { params: { skip: number } }]
    >;
    expect(calls[2][1].params.skip).toBe(150);
  });

  it('matches a stable base term from a detailed ICD display name', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          results: [
            {
              warnings: [
                'Use with caution in patients with diabetes mellitus.',
              ],
            },
          ],
        },
      }),
    );

    await expect(
      provider.checkInteraction({
        medicationName: 'Drug',
        conditionName: 'Type 2 diabetes mellitus without complications',
      }),
    ).resolves.toMatchObject({
      interacts: true,
      severity: 'moderate',
    });
  });

  it('falls back from RXCUI to the medication name when no RXCUI label exists', async () => {
    httpService.get
      .mockReturnValueOnce(
        throwError(() => ({
          isAxiosError: true,
          response: {
            status: 404,
          },
        })),
      )
      .mockReturnValueOnce(
        of({
          data: {
            results: [
              {
                contraindications: ['Contraindicated in asthma.'],
              },
            ],
          },
        }),
      );

    await expect(
      provider.checkInteraction({
        medicationName: 'Drug',
        rxcui: '123',
        conditionName: 'Asthma',
      }),
    ).resolves.toMatchObject({
      interacts: true,
      severity: 'contraindicated',
    });
    expect(httpService.get).toHaveBeenCalledTimes(2);
    expect(getSearchParameter(1)).toContain('openfda.generic_name');
  });

  it('does not broaden a successful RXCUI lookup to name-based labels', async () => {
    httpService.get.mockReturnValueOnce(
      of({
        data: {
          meta: { results: { total: 1 } },
          results: [{ contraindications: ['None known.'] }],
        },
      }),
    );

    await expect(
      provider.checkInteraction({
        medicationName: 'Drug',
        rxcui: '123',
        conditionName: 'Asthma',
      }),
    ).resolves.toMatchObject({
      interacts: false,
      severity: 'none',
    });

    expect(httpService.get).toHaveBeenCalledTimes(1);
    expect(getSearchParameter(0)).toContain('openfda.rxcui');
  });

  it('returns an unverified result when no matching label is available', async () => {
    httpService.get.mockReturnValue(
      throwError(() => ({
        isAxiosError: true,
        response: {
          status: 404,
        },
      })),
    );

    await expect(
      provider.checkInteraction({
        medicationName: 'Drug',
        conditionName: 'Asthma',
      }),
    ).resolves.toMatchObject({
      interacts: null,
      severity: 'unknown',
      source: 'openfda',
    });
  });

  it('returns an unverified result when openFDA is unavailable', async () => {
    httpService.get.mockReturnValue(
      throwError(() => new Error('network unavailable')),
    );

    await expect(
      provider.checkInteraction({
        medicationName: 'Drug',
        conditionName: 'Asthma',
      }),
    ).resolves.toMatchObject({
      interacts: null,
      severity: 'unknown',
      source: 'openfda',
    });
  });

  it('escapes medication names before placing them in the query', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          results: [],
        },
      }),
    );

    await provider.checkInteraction({
      medicationName: 'Drug "Plus"',
      conditionName: 'Asthma',
    });

    expect(getSearchParameter(0)).toContain('Drug \\"Plus\\"');
  });

  it('searches the base ingredient for a salt-qualified name', async () => {
    httpService.get
      .mockReturnValueOnce(
        of({
          data: {
            meta: { results: { total: 1 } },
            results: [{ contraindications: ['None known.'] }],
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            meta: { results: { total: 1 } },
            results: [{ contraindications: ['Contraindicated in diabetes.'] }],
          },
        }),
      );

    await expect(
      provider.checkInteraction({
        medicationName: 'PENTAMIDINE ISETHIONATE',
        conditionName: 'Diabetes',
      }),
    ).resolves.toMatchObject({
      interacts: true,
      severity: 'contraindicated',
    });

    expect(getSearchParameter(0)).toContain('PENTAMIDINE ISETHIONATE');
    expect(getSearchParameter(1)).toContain('PENTAMIDINE');
    expect(getSearchParameter(1)).not.toContain('ISETHIONATE');
  });

  it.each(['SODIUM CHLORIDE', 'POTASSIUM CHLORIDE'])(
    'does not strip standalone salt compound %s into a broad search',
    async (medicationName) => {
      httpService.get.mockReturnValue(
        of({
          data: {
            meta: { results: { total: 0 } },
            results: [],
          },
        }),
      );

      await provider.checkInteraction({
        medicationName,
        conditionName: 'Asthma',
      });

      expect(httpService.get).toHaveBeenCalledTimes(1);
      expect(getSearchParameter(0)).toContain(medicationName);
    },
  );
});
