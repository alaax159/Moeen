import { of, throwError } from 'rxjs';
import { DrugConditionChecker } from '../checkers/drug-condition.checker';
import { DdinterCsvProvider } from '../drug-drug/ddinter-csv.provider';
import { MedicationSafetyRouterService } from '../medication-safety-router.service';
import { PreferredDrugConditionProvider } from './preferred-drug-condition.provider';
import { OpenFdaDrugConditionProvider } from './openfda-drug-condition.provider';

describe('Drug–Disease source selection', () => {
  const input = { medicationName: 'Warfarin', conditionName: 'Asthma' };
  const confirmed = {
    interacts: true,
    severity: 'major',
    message: 'Confirmed drug–disease risk',
    source: 'ddinter',
  };

  it('gives a confirmed DDInter Drug–Disease result precedence without calling OpenFDA', async () => {
    const ddinter = {
      checkDrugDiseaseInteraction: jest.fn().mockResolvedValue(confirmed),
    };
    const fallback = { checkInteraction: jest.fn() };
    const provider = new PreferredDrugConditionProvider(
      ddinter as never,
      fallback as never,
    );
    await expect(provider.checkInteraction(input)).resolves.toEqual(confirmed);
    expect(ddinter.checkDrugDiseaseInteraction).toHaveBeenCalledWith(input);
    expect(fallback.checkInteraction).not.toHaveBeenCalled();
  });

  it('recognizes the existing CSV adapter as unsupported for Drug–Disease', async () => {
    const ddinter = new DdinterCsvProvider({} as never, {} as never);
    const drugPairLookup = jest.spyOn(ddinter, 'checkInteraction');
    const fallback = {
      checkInteraction: jest
        .fn()
        .mockResolvedValue({ interacts: false, severity: 'none' }),
    };
    const provider = new PreferredDrugConditionProvider(
      ddinter,
      fallback as never,
    );
    await provider.checkInteraction(input);
    expect(drugPairLookup).not.toHaveBeenCalled();
    expect(fallback.checkInteraction).toHaveBeenCalledWith(input);
  });

  it.each([
    null,
    { interacts: false, severity: 'none' },
    { interacts: null, severity: 'unknown' },
    { interacts: true, severity: 'unknown' },
  ])(
    'falls back when DDInter has no usable confirmed result: %j',
    async (result) => {
      const fallback = {
        checkInteraction: jest
          .fn()
          .mockResolvedValue({ interacts: false, severity: 'none' }),
      };
      const provider = new PreferredDrugConditionProvider(
        {
          checkDrugDiseaseInteraction: jest.fn().mockResolvedValue(result),
        } as never,
        fallback as never,
      );
      await provider.checkInteraction(input);
      expect(fallback.checkInteraction).toHaveBeenCalledWith(input);
    },
  );

  it.each([false, true])(
    'preserves router outcomes with OpenFDA unavailable=%s and DDInter unavailable',
    async (unavailable) => {
      const http = {
        get: jest.fn().mockReturnValue(
          unavailable
            ? throwError(() => new Error('offline'))
            : of({
                data: {
                  results: [{ warnings: ['Asthma was recorded at baseline.'] }],
                },
              }),
        ),
      };
      const provider = new PreferredDrugConditionProvider(
        {
          checkDrugDiseaseInteraction: jest
            .fn()
            .mockRejectedValue(new Error('offline')),
        } as never,
        new OpenFdaDrugConditionProvider(http as never),
      );
      const checker = new DrugConditionChecker(
        provider,
        {
          getActiveChronicConditions: jest
            .fn()
            .mockResolvedValue([{ id: 9, name: 'Asthma' }]),
        } as never,
        {} as never,
      );
      const router = new MedicationSafetyRouterService(
        { check: () => Promise.resolve([]) },
        { check: () => Promise.resolve([]) },
        checker,
        {} as never,
        {} as never,
      );
      const result = await router.route({
        type: 'medication_precheck',
        draft: {
          userId: 7,
          medicationId: null,
          dailyMedId: null,
          rxcui: '123',
          genericName: 'Warfarin',
          brandName: null,
          verificationSource: 'rxnorm',
          verificationStatus: 'verified',
        },
      });
      expect(result).toMatchObject({
        safe: !unavailable,
        outcome: unavailable ? 'unverified' : 'clear',
        warnings: [],
      });
      expect(result.checkerResults).toContainEqual(
        expect.objectContaining({
          checkerType: 'drug_condition',
          status: unavailable ? 'unavailable' : 'verified',
          warnings: [],
        }),
      );
    },
  );
});
