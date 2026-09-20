import { UnprocessableEntityException } from '@nestjs/common';

import type { MedicationSafetyEvent } from '../medication-safety.contracts';

import { DrugAllergyCheckerService } from './drug-allergy-checker.service';
import type { DrugAllergyContextProvider } from './drug-allergy.types';

describe('DrugAllergyCheckerService', () => {
  let contextProvider: {
    getUserMedicationContext: jest.Mock;
    getActiveAllergies: jest.Mock;
    getMedicationAllergens: jest.Mock;
    getMedicationAllergensByDailyMedId: jest.Mock;
    getAllergyMatchIdentifiers: jest.Mock;
  };

  let service: DrugAllergyCheckerService;

  const event: MedicationSafetyEvent = {
    type: 'medication_added',
    userMedicationId: 50,
  };

  beforeEach(() => {
    contextProvider = {
      getUserMedicationContext: jest.fn().mockResolvedValue({
        userId: 10,
        medicationId: 20,
      }),
      getActiveAllergies: jest.fn(),
      getMedicationAllergens: jest.fn(),
      getMedicationAllergensByDailyMedId: jest.fn(),
      getAllergyMatchIdentifiers: jest.fn(),
    };

    service = new DrugAllergyCheckerService(
      contextProvider as unknown as DrugAllergyContextProvider,
    );
  });

  it('returns a warning when a medication ingredient matches an allergy', async () => {
    contextProvider.getActiveAllergies.mockResolvedValue([
      {
        id: 1,
        name: 'Allergy to amoxicillin',
        severity: 'high',
        externalId: '294505008',
      },
    ]);

    contextProvider.getMedicationAllergens.mockResolvedValue([
      {
        identifier: 'unii:804826J2HU',
        name: 'AMOXICILLIN',
        source: 'drug_ingredient',
      },
    ]);

    contextProvider.getAllergyMatchIdentifiers.mockResolvedValue([
      'unii:804826J2HU',
    ]);

    const result = await service.check(event);

    expect(contextProvider.getUserMedicationContext).toHaveBeenCalledWith(50);

    expect(contextProvider.getActiveAllergies).toHaveBeenCalledWith(10);

    expect(contextProvider.getMedicationAllergens).toHaveBeenCalledWith(20);

    expect(contextProvider.getAllergyMatchIdentifiers).toHaveBeenCalledWith({
      id: 1,
      name: 'Allergy to amoxicillin',
      severity: 'high',
      externalId: '294505008',
    });

    expect(result).toEqual([
      {
        warningType: 'drug_allergy',
        severity: 'major',
        message:
          'Medication ingredient AMOXICILLIN matches the recorded allergy Allergy to amoxicillin.',
        affected: 'Allergy to amoxicillin',
        subjectUserMedicationIds: [50],
        subjectUserAllergyId: 1,
        evidence: [
          expect.objectContaining({
            source: 'dailymed',
            sourceRecordId: 'unii:804826J2HU',
          }),
        ],
      },
    ]);
  });

  it('returns no warnings when the user has no active allergies, without fetching medication allergens', async () => {
    contextProvider.getActiveAllergies.mockResolvedValue([]);

    const result = await service.check(event);

    expect(result).toEqual([]);

    // With no allergies to match against, fetching the medication's
    // allergens is skipped entirely — both to avoid a wasted lookup and
    // because that lookup can fail for medications without ingested
    // DailyMed data (see the regression test below).
    expect(contextProvider.getMedicationAllergens).not.toHaveBeenCalled();
    expect(contextProvider.getAllergyMatchIdentifiers).not.toHaveBeenCalled();
  });

  it('returns unknown coverage when DailyMed ingredient data is unavailable', async () => {
    contextProvider.getActiveAllergies.mockResolvedValue([
      {
        id: 1,
        name: 'Allergy to amoxicillin',
        severity: 'high',
        externalId: '294505008',
      },
    ]);
    contextProvider.getMedicationAllergens.mockRejectedValue(
      new UnprocessableEntityException(
        'Medication 20 does not have a DailyMed identifier',
      ),
    );

    const result = await service.check(event);

    expect(result).toEqual([
      {
        warningType: 'drug_allergy',
        severity: 'unknown',
        message:
          'Unable to verify drug-allergy safety because medication ingredient data is unavailable.',
        subjectUserMedicationIds: [50],
      },
    ]);
  });

  it('returns unknown coverage when the label has no verifiable ingredients', async () => {
    contextProvider.getActiveAllergies.mockResolvedValue([
      {
        id: 1,
        name: 'Allergy to amoxicillin',
        severity: 'high',
        externalId: '294505008',
      },
    ]);

    contextProvider.getMedicationAllergens.mockResolvedValue([]);

    const result = await service.check(event);

    expect(result).toEqual([
      {
        warningType: 'drug_allergy',
        severity: 'unknown',
        message:
          'Unable to verify drug-allergy safety because the medication label contains no verifiable ingredient data.',
        subjectUserMedicationIds: [50],
      },
    ]);

    expect(contextProvider.getAllergyMatchIdentifiers).not.toHaveBeenCalled();
  });

  it('returns no warning when allergy identifiers do not match medication ingredients', async () => {
    contextProvider.getActiveAllergies.mockResolvedValue([
      {
        id: 1,
        name: 'Example allergy',
        severity: 'medium',
        externalId: '123456',
      },
    ]);

    contextProvider.getMedicationAllergens.mockResolvedValue([
      {
        identifier: 'unii:MEDICATION123',
        name: 'EXAMPLE INGREDIENT',
        source: 'drug_ingredient',
      },
    ]);

    contextProvider.getAllergyMatchIdentifiers.mockResolvedValue([
      'unii:DIFFERENT123',
    ]);

    const result = await service.check(event);

    expect(result).toEqual([]);
  });

  it('returns an unknown observation when an allergy cannot be resolved', async () => {
    contextProvider.getActiveAllergies.mockResolvedValue([
      {
        id: 1,
        name: 'Legacy allergy',
        severity: 'high',
        externalId: null,
      },
    ]);

    contextProvider.getMedicationAllergens.mockResolvedValue([
      {
        identifier: 'unii:MEDICATION123',
        name: 'EXAMPLE INGREDIENT',
        source: 'drug_ingredient',
      },
    ]);

    contextProvider.getAllergyMatchIdentifiers.mockResolvedValue([]);

    await expect(service.check(event)).resolves.toEqual([
      expect.objectContaining({
        warningType: 'drug_allergy',
        severity: 'unknown',
        message:
          'Unable to verify drug-allergy safety because allergy 1 could not be resolved.',
        subjectUserMedicationIds: [50],
        subjectUserAllergyId: 1,
      }),
    ]);
  });

  // A confirmed match must stay a gradable finding even when the patient
  // record carries no usable severity. 'unknown' means "we could not check"
  // to the router, which drops those warnings — so grading an ungraded match
  // as 'unknown' would hide a real allergy match from the patient.
  it.each([
    ['null', null],
    ['an empty string', ''],
    ['whitespace', '   '],
    ['an unrecognised label', 'life-threatening'],
    ['a non-English label', 'شديد'],
  ])(
    'still reports a confirmed match as a finding when severity is %s',
    async (_label, severity) => {
      contextProvider.getActiveAllergies.mockResolvedValue([
        {
          id: 1,
          name: 'Allergy to amoxicillin',
          severity,
          externalId: '294505008',
        },
      ]);

      contextProvider.getMedicationAllergens.mockResolvedValue([
        {
          identifier: 'unii:804826J2HU',
          name: 'AMOXICILLIN',
          source: 'drug_ingredient',
        },
      ]);

      contextProvider.getAllergyMatchIdentifiers.mockResolvedValue([
        'unii:804826J2HU',
      ]);

      const result = await service.check(event);

      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('moderate');
      expect(result[0].severity).not.toBe('unknown');
      expect(result[0].subjectUserMedicationIds).toEqual([50]);
      expect(result[0].subjectUserAllergyId).toBe(1);
      expect(result[0].message).toContain(
        'matches the recorded allergy Allergy to amoxicillin.',
      );
      expect(result[0].message).toContain('severity is unspecified');
    },
  );

  it('grades a confirmed match from the recorded severity when it is usable', async () => {
    contextProvider.getActiveAllergies.mockResolvedValue([
      {
        id: 1,
        name: 'Allergy to amoxicillin',
        severity: 'severe',
        externalId: '294505008',
      },
    ]);

    contextProvider.getMedicationAllergens.mockResolvedValue([
      {
        identifier: 'unii:804826J2HU',
        name: 'AMOXICILLIN',
        source: 'drug_ingredient',
      },
    ]);

    contextProvider.getAllergyMatchIdentifiers.mockResolvedValue([
      'unii:804826J2HU',
    ]);

    const result = await service.check(event);

    expect(result[0].severity).toBe('major');
    expect(result[0].affected).toBe('Allergy to amoxicillin');
    expect(result[0].message).not.toContain('severity is unspecified');
  });

  it('does not return duplicate warnings for the same allergy and ingredient', async () => {
    contextProvider.getActiveAllergies.mockResolvedValue([
      {
        id: 1,
        name: 'Allergy to amoxicillin',
        severity: 'high',
        externalId: '294505008',
      },
    ]);

    contextProvider.getMedicationAllergens.mockResolvedValue([
      {
        identifier: 'unii:804826J2HU',
        name: 'AMOXICILLIN',
        source: 'drug_ingredient',
      },
      {
        identifier: 'unii:804826J2HU',
        name: 'AMOXICILLIN',
        source: 'drug_ingredient',
      },
    ]);

    contextProvider.getAllergyMatchIdentifiers.mockResolvedValue([
      'unii:804826J2HU',
    ]);

    const result = await service.check(event);

    expect(result).toHaveLength(1);

    expect(result[0]).toEqual({
      warningType: 'drug_allergy',
      severity: 'major',
      message:
        'Medication ingredient AMOXICILLIN matches the recorded allergy Allergy to amoxicillin.',
      affected: 'Allergy to amoxicillin',
      subjectUserMedicationIds: [50],
      subjectUserAllergyId: 1,
      evidence: [
        expect.objectContaining({
          source: 'dailymed',
          sourceRecordId: 'unii:804826J2HU',
        }),
      ],
    });
  });

  it('continues checking other allergies when one has no match identifiers', async () => {
    const firstAllergy = {
      id: 1,
      name: 'First allergy',
      severity: 'low',
      externalId: '111111',
    };

    const secondAllergy = {
      id: 2,
      name: 'Allergy to amoxicillin',
      severity: 'high',
      externalId: '294505008',
    };

    contextProvider.getActiveAllergies.mockResolvedValue([
      firstAllergy,
      secondAllergy,
    ]);

    contextProvider.getMedicationAllergens.mockResolvedValue([
      {
        identifier: 'unii:804826J2HU',
        name: 'AMOXICILLIN',
        source: 'drug_ingredient',
      },
    ]);

    contextProvider.getAllergyMatchIdentifiers
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['unii:804826J2HU']);

    const result = await service.check(event);

    expect(contextProvider.getAllergyMatchIdentifiers).toHaveBeenNthCalledWith(
      1,
      firstAllergy,
    );

    expect(contextProvider.getAllergyMatchIdentifiers).toHaveBeenNthCalledWith(
      2,
      secondAllergy,
    );

    expect(result).toEqual([
      {
        warningType: 'drug_allergy',
        severity: 'unknown',
        message:
          'Unable to verify drug-allergy safety because allergy 1 could not be resolved.',
        subjectUserMedicationIds: [50],
        subjectUserAllergyId: 1,
      },
      {
        warningType: 'drug_allergy',
        severity: 'major',
        message:
          'Medication ingredient AMOXICILLIN matches the recorded allergy Allergy to amoxicillin.',
        affected: 'Allergy to amoxicillin',
        subjectUserMedicationIds: [50],
        subjectUserAllergyId: 2,
        evidence: [
          expect.objectContaining({
            source: 'dailymed',
            sourceRecordId: 'unii:804826J2HU',
          }),
        ],
      },
    ]);
  });

  it('checks a DailyMed draft directly during medication precheck', async () => {
    contextProvider.getActiveAllergies.mockResolvedValue([
      {
        id: 1,
        name: 'Allergy to amoxicillin',
        severity: 'high',
        externalId: '294505008',
      },
    ]);

    contextProvider.getMedicationAllergensByDailyMedId.mockResolvedValue([
      {
        identifier: 'unii:804826J2HU',
        name: 'AMOXICILLIN',
        source: 'drug_ingredient',
      },
    ]);

    contextProvider.getAllergyMatchIdentifiers.mockResolvedValue([
      'unii:804826J2HU',
    ]);

    const result = await service.check({
      type: 'medication_precheck',
      draft: {
        userId: 10,
        medicationId: null,
        dailyMedId: 'example-dailymed-set-id',
        brandName: 'Amoxicillin',
        genericName: 'amoxicillin',
        verificationSource: 'dailymed',
        verificationStatus: 'verified',
      },
    });

    expect(
      contextProvider.getMedicationAllergensByDailyMedId,
    ).toHaveBeenCalledWith('example-dailymed-set-id');

    expect(contextProvider.getMedicationAllergens).not.toHaveBeenCalled();

    expect(result).toEqual([
      {
        warningType: 'drug_allergy',
        severity: 'major',
        message:
          'Medication ingredient AMOXICILLIN matches the recorded allergy Allergy to amoxicillin.',
        affected: 'Allergy to amoxicillin',
        subjectUserAllergyId: 1,
        evidence: [
          expect.objectContaining({
            source: 'dailymed',
            sourceRecordId: 'unii:804826J2HU',
          }),
        ],
      },
    ]);
  });
});
