import { SafetyWarningsService } from './safety-warnings.service';

describe('SafetyWarningsService', () => {
  let safetyWarningRepository: {
    findActiveWarningsForUser: jest.Mock;
    findCheckStatusesForUser: jest.Mock;
    replaceActiveWarnings: jest.Mock;
    recordFailedCheck: jest.Mock;
  };
  let userMedicationRepository: {
    getUserIdByFirebaseUid: jest.Mock;
    getActiveMedicationsByUserId: jest.Mock;
  };
  let medicationSafetyRouter: { route: jest.Mock };
  let knowledgeStatusService: { evaluate: jest.Mock };

  let service: SafetyWarningsService;

  const med = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 1,
    medicationId: 5,
    brandName: 'Zestril',
    genericName: 'lisinopril',
    ...overrides,
  });

  const fullKnowledge = {
    checkAllergies: true,
    checkConditions: true,
    warnings: [],
  };

  beforeEach(() => {
    safetyWarningRepository = {
      findActiveWarningsForUser: jest.fn().mockResolvedValue([]),
      findCheckStatusesForUser: jest.fn().mockResolvedValue([]),
      replaceActiveWarnings: jest.fn().mockResolvedValue(undefined),
      recordFailedCheck: jest.fn().mockResolvedValue(undefined),
    };
    userMedicationRepository = {
      getUserIdByFirebaseUid: jest.fn().mockResolvedValue(7),
      getActiveMedicationsByUserId: jest.fn().mockResolvedValue([]),
    };
    medicationSafetyRouter = { route: jest.fn() };
    knowledgeStatusService = {
      evaluate: jest.fn().mockResolvedValue(fullKnowledge),
    };

    service = new SafetyWarningsService(
      safetyWarningRepository as never,
      userMedicationRepository as never,
      medicationSafetyRouter as never,
      knowledgeStatusService as never,
    );
  });

  it('returns an empty list when the firebase user has no application account', async () => {
    userMedicationRepository.getUserIdByFirebaseUid.mockResolvedValue(undefined);

    const result = await service.getSafetyWarnings('firebase-uid');

    expect(result).toEqual({ medications: [] });
    expect(
      userMedicationRepository.getActiveMedicationsByUserId,
    ).not.toHaveBeenCalled();
    expect(medicationSafetyRouter.route).not.toHaveBeenCalled();
    expect(knowledgeStatusService.evaluate).not.toHaveBeenCalled();
  });

  it('returns an empty list when the user has no active medications', async () => {
    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([]);

    const result = await service.getSafetyWarnings('firebase-uid');

    expect(result).toEqual({ medications: [] });
    expect(medicationSafetyRouter.route).not.toHaveBeenCalled();
    expect(knowledgeStatusService.evaluate).not.toHaveBeenCalled();
  });

  it('reads persisted warnings without recomputing, and reports checked status + no unverified areas', async () => {
    const checkedAt = new Date('2026-09-01T09:00:00.000Z');
    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      med(),
    ]);
    safetyWarningRepository.findActiveWarningsForUser.mockResolvedValue([
      {
        userMedicationId: 1,
        warningType: 'drug_condition',
        severity: 'high',
        message: 'Lisinopril is risky with your kidney condition.',
        checkedAt,
      },
    ]);
    safetyWarningRepository.findCheckStatusesForUser.mockResolvedValue([
      { userMedicationId: 1, status: 'checked', checkedAt },
    ]);

    const result = await service.getSafetyWarnings('firebase-uid');

    expect(medicationSafetyRouter.route).not.toHaveBeenCalled();
    expect(safetyWarningRepository.replaceActiveWarnings).not.toHaveBeenCalled();
    expect(result).toEqual({
      medications: [
        {
          userMedicationId: 1,
          medicationId: 5,
          brandName: 'Zestril',
          genericName: 'lisinopril',
          status: 'checked',
          lastCheckedAt: '2026-09-01T09:00:00.000Z',
          unverified: [],
          warnings: [
            {
              warningType: 'drug_condition',
              severity: 'high',
              message: 'Lisinopril is risky with your kidney condition.',
            },
          ],
        },
      ],
    });
  });

  it('treats a medication with a checked-status row and zero warnings as checked (no recompute on the next GET)', async () => {
    const checkedAt = new Date('2026-09-02T08:00:00.000Z');
    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      med(),
    ]);
    safetyWarningRepository.findActiveWarningsForUser.mockResolvedValue([]);
    safetyWarningRepository.findCheckStatusesForUser.mockResolvedValue([
      { userMedicationId: 1, status: 'checked', checkedAt },
    ]);

    const result = await service.getSafetyWarnings('firebase-uid');

    expect(medicationSafetyRouter.route).not.toHaveBeenCalled();
    expect(result.medications[0]).toMatchObject({
      status: 'checked',
      lastCheckedAt: '2026-09-02T08:00:00.000Z',
      warnings: [],
    });
  });

  it('recomputes via medication_updated for a never-checked medication and persists the findings', async () => {
    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      med(),
    ]);
    safetyWarningRepository.findActiveWarningsForUser.mockResolvedValue([]);
    safetyWarningRepository.findCheckStatusesForUser.mockResolvedValue([]);
    medicationSafetyRouter.route.mockResolvedValue({
      safe: false,
      warnings: [
        {
          warningType: 'drug_drug',
          severity: 'moderate',
          message: 'Interacts with warfarin.',
        },
        {
          warningType: 'drug_allergy',
          severity: 'high',
          message: 'Contains a penicillin you are allergic to.',
        },
        {
          warningType: 'drug_condition',
          severity: 'moderate',
          message: 'Caution with your kidney condition.',
        },
      ],
    });

    const result = await service.getSafetyWarnings('firebase-uid');

    expect(medicationSafetyRouter.route).toHaveBeenCalledWith({
      type: 'medication_updated',
      userMedicationId: 1,
    });
    expect(safetyWarningRepository.replaceActiveWarnings).toHaveBeenCalledWith(1, [
      {
        warningType: 'drug_drug',
        severity: 'moderate',
        message: 'Interacts with warfarin.',
      },
      {
        warningType: 'drug_allergy',
        severity: 'high',
        message: 'Contains a penicillin you are allergic to.',
      },
      {
        warningType: 'drug_condition',
        severity: 'moderate',
        message: 'Caution with your kidney condition.',
      },
    ]);
    expect(result.medications[0]).toMatchObject({
      status: 'checked',
      unverified: [],
      warnings: [
        {
          warningType: 'drug_allergy',
          severity: 'high',
          message: 'Contains a penicillin you are allergic to.',
        },
        {
          warningType: 'drug_condition',
          severity: 'moderate',
          message: 'Caution with your kidney condition.',
        },
      ],
    });
    expect(typeof result.medications[0].lastCheckedAt).toBe('string');
  });

  it('keeps a confirmed allergy match with unknown severity in the response (Ahmad #2)', async () => {
    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      med(),
    ]);
    safetyWarningRepository.findCheckStatusesForUser.mockResolvedValue([]);
    medicationSafetyRouter.route.mockResolvedValue({
      safe: false,
      warnings: [
        {
          warningType: 'drug_allergy',
          severity: 'unknown',
          message:
            'Medication ingredient amoxicillin matches the recorded allergy penicillin.',
        },
      ],
    });

    const result = await service.getSafetyWarnings('firebase-uid');

    expect(safetyWarningRepository.replaceActiveWarnings).toHaveBeenCalledWith(1, [
      {
        warningType: 'drug_allergy',
        severity: 'unknown',
        message:
          'Medication ingredient amoxicillin matches the recorded allergy penicillin.',
      },
    ]);
    expect(result.medications[0].warnings).toEqual([
      {
        warningType: 'drug_allergy',
        severity: 'unknown',
        message:
          'Medication ingredient amoxicillin matches the recorded allergy penicillin.',
      },
    ]);
  });

  it('reports an incomplete profile via `unverified` and drops the knowledge-status notice from warnings (Ahmad #3)', async () => {
    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      med(),
    ]);
    safetyWarningRepository.findCheckStatusesForUser.mockResolvedValue([]);
    knowledgeStatusService.evaluate.mockResolvedValue({
      checkAllergies: false,
      checkConditions: true,
      warnings: [
        {
          warningType: 'drug_allergy',
          severity: 'unknown',
          message:
            'Allergy information is missing. Medication safety could not be fully verified.',
        },
      ],
    });
    medicationSafetyRouter.route.mockResolvedValue({
      safe: false,
      warnings: [
        {
          warningType: 'drug_allergy',
          severity: 'unknown',
          message:
            'Allergy information is missing. Medication safety could not be fully verified.',
        },
        {
          warningType: 'drug_condition',
          severity: 'moderate',
          message: 'Caution with your kidney condition.',
        },
      ],
    });

    const result = await service.getSafetyWarnings('firebase-uid');

    expect(result.medications[0].unverified).toEqual(['allergy']);
    // the "info missing" drug_allergy notice is not persisted and not surfaced
    expect(safetyWarningRepository.replaceActiveWarnings).toHaveBeenCalledWith(1, [
      {
        warningType: 'drug_condition',
        severity: 'moderate',
        message: 'Caution with your kidney condition.',
      },
    ]);
    expect(result.medications[0].status).toBe('checked');
    expect(result.medications[0].warnings).toEqual([
      {
        warningType: 'drug_condition',
        severity: 'moderate',
        message: 'Caution with your kidney condition.',
      },
    ]);
  });

  it('surfaces an explicit failed status when the live recompute throws, not a clean empty result (Ahmad #1)', async () => {
    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      med(),
    ]);
    safetyWarningRepository.findActiveWarningsForUser.mockResolvedValue([]);
    safetyWarningRepository.findCheckStatusesForUser.mockResolvedValue([]);
    medicationSafetyRouter.route.mockRejectedValue(new Error('OpenFDA timeout'));

    const result = await service.getSafetyWarnings('firebase-uid');

    expect(safetyWarningRepository.recordFailedCheck).toHaveBeenCalledWith(1);
    expect(safetyWarningRepository.replaceActiveWarnings).not.toHaveBeenCalled();
    expect(result.medications[0]).toMatchObject({
      status: 'failed',
      lastCheckedAt: null,
      warnings: [],
    });
  });

  it('retries the recompute for a failed-status medication even when it still has leftover warnings', async () => {
    const checkedAt = new Date('2026-08-30T07:00:00.000Z');
    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      med(),
    ]);
    safetyWarningRepository.findActiveWarningsForUser.mockResolvedValue([
      {
        userMedicationId: 1,
        warningType: 'drug_allergy',
        severity: 'high',
        message: 'Recorded penicillin allergy.',
        checkedAt,
      },
    ]);
    safetyWarningRepository.findCheckStatusesForUser.mockResolvedValue([
      { userMedicationId: 1, status: 'failed', checkedAt },
    ]);
    medicationSafetyRouter.route.mockRejectedValue(new Error('still down'));

    const result = await service.getSafetyWarnings('firebase-uid');

    // recompute fired despite the leftover warning rows
    expect(medicationSafetyRouter.route).toHaveBeenCalledWith({
      type: 'medication_updated',
      userMedicationId: 1,
    });
    expect(safetyWarningRepository.recordFailedCheck).toHaveBeenCalledWith(1);
    // failed retry -> failed status + the last known-good warnings + last success time
    expect(result.medications[0]).toMatchObject({
      status: 'failed',
      lastCheckedAt: '2026-08-30T07:00:00.000Z',
      warnings: [
        {
          warningType: 'drug_allergy',
          severity: 'high',
          message: 'Recorded penicillin allergy.',
        },
      ],
    });
  });

  it('degrades one medication whose recompute fails without affecting the others', async () => {
    const checkedAt = new Date('2026-09-01T07:00:00.000Z');
    userMedicationRepository.getActiveMedicationsByUserId.mockResolvedValue([
      med({ id: 1, medicationId: 5 }),
      med({
        id: 2,
        medicationId: 6,
        brandName: 'Amoxil',
        genericName: 'amoxicillin',
      }),
    ]);
    safetyWarningRepository.findActiveWarningsForUser.mockResolvedValue([
      {
        userMedicationId: 2,
        warningType: 'drug_allergy',
        severity: 'high',
        message: 'Recorded penicillin allergy.',
        checkedAt,
      },
    ]);
    safetyWarningRepository.findCheckStatusesForUser.mockResolvedValue([
      { userMedicationId: 2, status: 'checked', checkedAt },
    ]);
    medicationSafetyRouter.route.mockRejectedValue(new Error('OpenFDA timeout'));

    const result = await service.getSafetyWarnings('firebase-uid');

    expect(result.medications).toEqual([
      {
        userMedicationId: 1,
        medicationId: 5,
        brandName: 'Zestril',
        genericName: 'lisinopril',
        status: 'failed',
        lastCheckedAt: null,
        unverified: [],
        warnings: [],
      },
      {
        userMedicationId: 2,
        medicationId: 6,
        brandName: 'Amoxil',
        genericName: 'amoxicillin',
        status: 'checked',
        lastCheckedAt: '2026-09-01T07:00:00.000Z',
        unverified: [],
        warnings: [
          {
            warningType: 'drug_allergy',
            severity: 'high',
            message: 'Recorded penicillin allergy.',
          },
        ],
      },
    ]);
  });
});
