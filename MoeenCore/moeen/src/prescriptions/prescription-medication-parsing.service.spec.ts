import { Logger } from '@nestjs/common';
import { RxNormUnavailableError } from '../medication-safety/rxnorm/rxnorm-unavailable.error';
import {
  PrescriptionMedicationParserOutputError,
  PrescriptionMedicationParsingService,
} from './prescription-medication-parsing.service';

const parsed = {
  name: 'Amoxicillin',
  dose: 500,
  unit: 'mg',
  dosageForm: 'capsule',
  frequency: '3 times daily',
  duration: '7 days',
  times: [],
  instructions: 'after food',
};

function setup(
  parserOutput: unknown = [parsed],
  resolution: unknown = {
    status: 'resolved',
    inputName: 'Amoxicillin',
    rxcui: '723',
  },
  ingredientNames: string[] = ['amoxicillin'],
) {
  const parser = { parse: jest.fn().mockReturnValue(parserOutput) };
  const rxNorm = {
    resolveMedication: jest.fn().mockResolvedValue(resolution),
    getIngredientNames: jest.fn().mockResolvedValue(ingredientNames),
  };
  return {
    service: new PrescriptionMedicationParsingService(parser, rxNorm as never),
    parser,
    rxNorm,
  };
}

describe('PrescriptionMedicationParsingService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('normalizes a reliable RxNorm identity', async () => {
    const { service, rxNorm } = setup();
    await expect(service.parseAndNormalize('OCR')).resolves.toEqual([
      {
        ...parsed,
        rxcui: '723',
        normalizedName: 'amoxicillin',
        needsReview: false,
      },
    ]);
    expect(rxNorm.resolveMedication).toHaveBeenCalledWith('Amoxicillin', null);
    expect(rxNorm.getIngredientNames).toHaveBeenCalledWith('723');
  });

  it.each([
    { status: 'not_found', inputName: 'Unknown' },
    { status: 'ambiguous', inputName: 'Drug', rxcuis: ['1', '2'] },
  ])('keeps unresolved drafts for RxNorm result %#', async (resolution) => {
    const { service, rxNorm } = setup([parsed], resolution);
    await expect(service.parseAndNormalize('OCR')).resolves.toEqual([
      {
        ...parsed,
        rxcui: null,
        normalizedName: null,
        needsReview: true,
      },
    ]);
    expect(rxNorm.getIngredientNames).not.toHaveBeenCalled();
  });

  it('keeps the extracted draft when RxNorm is unavailable', async () => {
    const { service, rxNorm } = setup();
    rxNorm.resolveMedication.mockRejectedValue(
      new RxNormUnavailableError('Amoxicillin'),
    );
    await expect(service.parseAndNormalize('OCR')).resolves.toEqual([
      expect.objectContaining({
        name: 'Amoxicillin',
        rxcui: null,
        normalizedName: null,
        needsReview: true,
      }),
    ]);
  });

  it('marks an identity for review when RxNorm ingredients are ambiguous', async () => {
    const { service } = setup([parsed], undefined, ['drug a', 'drug b']);
    await expect(service.parseAndNormalize('OCR')).resolves.toEqual([
      expect.objectContaining({
        rxcui: '723',
        normalizedName: null,
        needsReview: true,
      }),
    ]);
  });

  it('normalizes multiple medications independently', async () => {
    const second = { ...parsed, name: 'Paracetamol' };
    const { service, rxNorm } = setup([parsed, second]);
    rxNorm.resolveMedication
      .mockResolvedValueOnce({
        status: 'resolved',
        inputName: 'Amoxicillin',
        rxcui: '723',
      })
      .mockResolvedValueOnce({
        status: 'resolved',
        inputName: 'Paracetamol',
        rxcui: '161',
      });
    rxNorm.getIngredientNames
      .mockResolvedValueOnce(['amoxicillin'])
      .mockResolvedValueOnce(['acetaminophen']);

    const result = await service.parseAndNormalize('OCR');
    expect(
      result.map(({ rxcui, normalizedName }) => ({ rxcui, normalizedName })),
    ).toEqual([
      { rxcui: '723', normalizedName: 'amoxicillin' },
      { rxcui: '161', normalizedName: 'acetaminophen' },
    ]);
  });

  it('preserves both drafts when only one medication resolves', async () => {
    const unresolved = { ...parsed, name: 'Unclear Drug' };
    const { service, rxNorm } = setup([parsed, unresolved]);
    rxNorm.resolveMedication
      .mockResolvedValueOnce({
        status: 'resolved',
        inputName: 'Amoxicillin',
        rxcui: '723',
      })
      .mockResolvedValueOnce({
        status: 'not_found',
        inputName: 'Unclear Drug',
      });

    const result = await service.parseAndNormalize('OCR');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(expect.objectContaining({ needsReview: false }));
    expect(result[1]).toEqual(
      expect.objectContaining({
        name: 'Unclear Drug',
        rxcui: null,
        normalizedName: null,
        needsReview: true,
      }),
    );
  });

  it('keeps parser review requirements even when identity resolves', async () => {
    const { service } = setup([{ ...parsed, requiresReview: true }]);
    await expect(service.parseAndNormalize('OCR')).resolves.toEqual([
      expect.objectContaining({
        rxcui: '723',
        normalizedName: 'amoxicillin',
        needsReview: true,
      }),
    ]);
  });

  it.each([
    null,
    {},
    [{ ...parsed, dose: '500' }],
    [{ ...parsed, times: null }],
  ])('rejects malformed parser output %#', async (output) => {
    const { service } = setup(output);
    await expect(service.parseAndNormalize('OCR')).rejects.toBeInstanceOf(
      PrescriptionMedicationParserOutputError,
    );
  });
});
