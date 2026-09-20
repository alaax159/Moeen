import { ActiveInteractionsService } from './active-interactions.service';

describe('ActiveInteractionsService', () => {
  let userMedicationRepository: {
    getUserMedications: jest.Mock;
  };

  let medicationSafetyRouter: {
    route: jest.Mock;
  };

  let safetyWarningRepository: {
    getActiveWarnings: jest.Mock;
  };

  let service: ActiveInteractionsService;

  beforeEach(() => {
    userMedicationRepository = {
      getUserMedications: jest.fn(),
    };

    medicationSafetyRouter = {
      route: jest.fn(),
    };

    safetyWarningRepository = {
      getActiveWarnings: jest.fn(),
    };

    service = new ActiveInteractionsService(
      userMedicationRepository as never,
      medicationSafetyRouter as never,
      safetyWarningRepository as never,
    );
  });

  it('returns no interactions when the user has no active ongoing medications', async () => {
    userMedicationRepository.getUserMedications.mockResolvedValue([]);

    const result = await service.getActiveInteractions('firebase-user');

    expect(userMedicationRepository.getUserMedications).toHaveBeenCalledWith(
      'firebase-user',
      'active',
    );

    expect(medicationSafetyRouter.route).not.toHaveBeenCalled();
    expect(safetyWarningRepository.getActiveWarnings).not.toHaveBeenCalled();

    expect(result).toEqual({
      interactions: [],
    });
  });

  it('checks only ongoing medications, removes duplicates and unknown warnings, and sorts strongest first', async () => {
    userMedicationRepository.getUserMedications.mockResolvedValue([
      {
        id: 10,
        completion: 'ongoing',
      },
      {
        id: 20,
        completion: 'completed',
      },
      {
        id: 30,
        completion: 'ongoing',
      },
    ]);

    medicationSafetyRouter.route.mockResolvedValue(undefined);
    safetyWarningRepository.getActiveWarnings.mockResolvedValue([
      {
        userMedicationId: 10,
        warningType: 'drug_drug',
        severity: 'moderate',
        message: 'Naltrexone interacts with Abacavir.',
        affected: null,
      },
      {
        userMedicationId: 10,
        warningType: 'drug_allergy',
        severity: 'high',
        message: 'Amoxicillin matches the recorded allergy.',
        affected: 'Amoxicillin allergy',
      },
      {
        userMedicationId: 10,
        warningType: 'drug_condition',
        severity: 'unknown',
        message: 'Interaction could not be verified.',
        affected: null,
      },
      // Duplicate of medication 10's drug_drug warning above — same
      // medication, so it must collapse into one entry.
      {
        userMedicationId: 10,
        warningType: 'drug_drug',
        severity: 'moderate',
        message: 'Naltrexone interacts with Abacavir.',
        affected: null,
      },
      // Same type, severity and message as medication 10's drug_drug
      // warning, but for a different medication — must NOT collapse.
      {
        userMedicationId: 30,
        warningType: 'drug_drug',
        severity: 'moderate',
        message: 'Naltrexone interacts with Abacavir.',
        affected: null,
      },
      {
        userMedicationId: 30,
        warningType: 'drug_condition',
        severity: 'contraindicated',
        message: 'Propranolol is contraindicated with asthma.',
        affected: 'Asthma',
      },
    ]);

    const result = await service.getActiveInteractions('firebase-user');

    expect(medicationSafetyRouter.route).toHaveBeenCalledTimes(2);

    expect(medicationSafetyRouter.route).toHaveBeenNthCalledWith(1, {
      type: 'active_review',
      userMedicationId: 10,
    });

    expect(medicationSafetyRouter.route).toHaveBeenNthCalledWith(2, {
      type: 'active_review',
      userMedicationId: 30,
    });

    expect(safetyWarningRepository.getActiveWarnings).toHaveBeenCalledWith([
      10, 30,
    ]);

    expect(result).toEqual({
      interactions: [
        {
          userMedicationId: 30,
          warningType: 'drug_condition',
          severity: 'contraindicated',
          message: 'Propranolol is contraindicated with asthma.',
          affected: 'Asthma',
        },
        {
          userMedicationId: 10,
          warningType: 'drug_allergy',
          severity: 'high',
          message: 'Amoxicillin matches the recorded allergy.',
          affected: 'Amoxicillin allergy',
        },
        {
          userMedicationId: 10,
          warningType: 'drug_drug',
          severity: 'moderate',
          message: 'Naltrexone interacts with Abacavir.',
        },
        {
          userMedicationId: 30,
          warningType: 'drug_drug',
          severity: 'moderate',
          message: 'Naltrexone interacts with Abacavir.',
        },
      ],
    });
  });

  it('does not collapse warnings that share type, severity and message but affect different allergies or conditions', async () => {
    userMedicationRepository.getUserMedications.mockResolvedValue([
      {
        id: 10,
        completion: 'ongoing',
      },
    ]);

    medicationSafetyRouter.route.mockResolvedValue(undefined);
    safetyWarningRepository.getActiveWarnings.mockResolvedValue([
      // Same medication, type, severity and message — only `affected`
      // distinguishes these. Both must survive dedup.
      {
        userMedicationId: 10,
        warningType: 'drug_condition',
        severity: 'moderate',
        message: 'Interaction could not be fully characterized.',
        affected: 'Asthma',
      },
      {
        userMedicationId: 10,
        warningType: 'drug_condition',
        severity: 'moderate',
        message: 'Interaction could not be fully characterized.',
        affected: 'Diabetes',
      },
    ]);

    const result = await service.getActiveInteractions('firebase-user');

    expect(result.interactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          affected: 'Asthma',
          userMedicationId: 10,
        }),
        expect.objectContaining({
          affected: 'Diabetes',
          userMedicationId: 10,
        }),
      ]),
    );
    expect(result.interactions).toHaveLength(2);
  });
});
