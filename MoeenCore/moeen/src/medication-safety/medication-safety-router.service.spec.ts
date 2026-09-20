import { meetsEscalationThreshold } from '../guidance/escalation-policy';
import type { MedicationSafetyChecker } from './medication-safety.contracts';
import { MedicationSafetyRouterService } from './medication-safety-router.service';

jest.mock('../guidance/escalation-policy', () => ({
  ...jest.requireActual('../guidance/escalation-policy'),
  meetsEscalationThreshold: jest.fn(() => false),
}));

const mockedMeetsEscalationThreshold = jest.mocked(meetsEscalationThreshold);

describe('MedicationSafetyRouterService', () => {
  const context = {
    userId: 7,
    contextVersion: 3,
    subjectUserMedicationId: 42,
    activeUserMedicationIds: [42, 43],
    activeUserAllergyIds: [8],
    activeUserConditionIds: [9],
    activeMedications: [],
    activeAllergies: [],
    activeConditions: [],
  };

  function checker(result: unknown[] = []): MedicationSafetyChecker {
    return { check: jest.fn().mockResolvedValue(result) };
  }

  function build(
    options: {
      drugDrug?: MedicationSafetyChecker;
      drugAllergy?: MedicationSafetyChecker;
      drugCondition?: MedicationSafetyChecker;
      allergyKnowledgeStatus?: 'unknown' | 'none_known' | 'has_records';
      conditionKnowledgeStatus?: 'unknown' | 'none_known' | 'has_records';
    } = {},
  ) {
    const drugDrug = options.drugDrug ?? checker();
    const drugAllergy = options.drugAllergy ?? checker();
    const drugCondition = options.drugCondition ?? checker();
    const knowledgeStatus = {
      evaluate: jest.fn().mockResolvedValue({
        allergyKnowledgeStatus: options.allergyKnowledgeStatus ?? 'none_known',
        conditionKnowledgeStatus:
          options.conditionKnowledgeStatus ?? 'none_known',
      }),
    };
    const repository = {
      captureContext: jest.fn().mockResolvedValue(context),
      hashContext: jest.fn().mockReturnValue('context-hash'),
      persistRun: jest.fn().mockResolvedValue('run-123'),
    };

    const emergencyContactNotificationService = {
      notify: jest.fn().mockResolvedValue([]),
    };

    const service = new MedicationSafetyRouterService(
      drugDrug,
      drugAllergy,
      drugCondition,
      knowledgeStatus as never,
      repository as never,
      emergencyContactNotificationService as never,
    );

    return {
      service,
      drugDrug,
      drugAllergy,
      drugCondition,
      knowledgeStatus,
      repository,
      emergencyContactNotificationService,
    };
  }

  it('persists a complete clear result when every required checker completes', async () => {
    const { service, repository, drugAllergy, drugCondition } = build();

    await expect(
      service.route({
        type: 'medication_added',
        userMedicationId: 42,
        idempotencyKey: 'add:42',
      }),
    ).resolves.toMatchObject({
      runId: 'run-123',
      safe: true,
      outcome: 'clear',
      coverageStatus: 'complete',
      severity: 'clear',
      warnings: [],
    });

    expect(drugAllergy.check).not.toHaveBeenCalled();
    expect(drugCondition.check).not.toHaveBeenCalled();
    expect(repository.persistRun).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'add:42',
        requiredChecks: ['drug_drug', 'drug_allergy', 'drug_condition'],
        outcome: 'clear',
        coverageStatus: 'complete',
      }),
    );
  });

  it('notifies emergency contacts when the persisted safety severity meets the escalation threshold', async () => {
    mockedMeetsEscalationThreshold.mockReturnValueOnce(true);

    const interaction = {
      warningType: 'drug_drug' as const,
      severity: 'major' as const,
      message: 'Clinically important interaction.',
      subjectUserMedicationIds: [42, 43],
    };

    const { service, repository, emergencyContactNotificationService } = build({
      drugDrug: checker([interaction]),
    });

    const result = await service.route({
      type: 'medication_updated',
      userMedicationId: 42,
    });

    expect(repository.persistRun).toHaveBeenCalled();
    expect(mockedMeetsEscalationThreshold).toHaveBeenCalledWith('major');

    expect(emergencyContactNotificationService.notify).toHaveBeenCalledWith(
      7,
      'severe_medication_reaction',
    );

    expect(result).toMatchObject({
      runId: 'run-123',
      severity: 'major',
    });
  });

  it('keeps the persisted safety result when emergency-contact notification fails', async () => {
    mockedMeetsEscalationThreshold.mockReturnValueOnce(true);

    const interaction = {
      warningType: 'drug_drug' as const,
      severity: 'major' as const,
      message: 'Clinically important interaction.',
      subjectUserMedicationIds: [42, 43],
    };

    const { service, repository, emergencyContactNotificationService } = build({
      drugDrug: checker([interaction]),
    });

    emergencyContactNotificationService.notify.mockRejectedValueOnce(
      new Error('SMS provider unavailable'),
    );

    await expect(
      service.route({
        type: 'medication_updated',
        userMedicationId: 42,
      }),
    ).resolves.toMatchObject({
      runId: 'run-123',
      severity: 'major',
    });

    expect(repository.persistRun).toHaveBeenCalled();

    expect(emergencyContactNotificationService.notify).toHaveBeenCalledWith(
      7,
      'severe_medication_reaction',
    );
  });

  it('records a failed checker as partial coverage without losing successful findings', async () => {
    const allergy = {
      check: jest.fn().mockRejectedValue(new Error('provider offline')),
    } as MedicationSafetyChecker;
    const interaction = {
      warningType: 'drug_drug' as const,
      severity: 'major' as const,
      message: 'Clinically important interaction.',
      subjectUserMedicationIds: [42, 43],
    };
    const { service, repository } = build({
      drugDrug: checker([interaction]),
      drugAllergy: allergy,
      allergyKnowledgeStatus: 'has_records',
    });

    const result = await service.route({
      type: 'medication_updated',
      userMedicationId: 42,
    });

    expect(result).toMatchObject({
      safe: false,
      outcome: 'findings',
      coverageStatus: 'partial',
      severity: 'major',
      warnings: [interaction],
    });
    expect(repository.persistRun).toHaveBeenCalledWith(
      expect.objectContaining({
        checkerResults: expect.arrayContaining([
          expect.objectContaining({
            checkerType: 'drug_allergy',
            status: 'failed',
            reasonCode: 'drug_allergy_checker_failed',
          }),
        ]),
      }),
    );
  });

  it('turns unknown checker output into unavailable coverage, not a finding', async () => {
    const { service } = build({
      drugDrug: checker([
        {
          warningType: 'drug_drug',
          severity: 'unknown',
          message: 'Could not resolve the medication.',
        },
      ]),
    });

    await expect(
      service.route({ type: 'dose_missed', userMedicationId: 42 }),
    ).resolves.toMatchObject({
      safe: false,
      outcome: 'unverified',
      coverageStatus: 'partial',
      severity: 'unverified',
      warnings: [],
      checkerResults: [
        expect.objectContaining({
          checkerType: 'drug_drug',
          status: 'unavailable',
        }),
      ],
    });
  });

  // Regression guard: a confirmed allergy match whose severity the patient
  // record never graded must reach the patient as a finding. Reporting it as
  // 'unknown' would make the router treat a real match as a coverage gap and
  // drop it from the result entirely.
  it('surfaces a confirmed but ungraded allergy match as a finding, not a coverage gap', async () => {
    const { service, repository } = build({
      allergyKnowledgeStatus: 'has_records',
      drugAllergy: checker([
        {
          warningType: 'drug_allergy',
          severity: 'moderate',
          message:
            'Medication ingredient AMOXICILLIN matches the recorded allergy' +
            ' Allergy to amoxicillin. The recorded allergy severity is' +
            ' unspecified, so this match has not been graded from the' +
            ' patient record.',
          subjectUserMedicationIds: [42],
          subjectUserAllergyId: 8,
        },
      ]),
    });

    const result = await service.route({
      type: 'medication_added',
      userMedicationId: 42,
    });

    expect(result.outcome).toBe('findings');
    expect(result.outcome).not.toBe('unverified');
    expect(result.safe).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].subjectUserAllergyId).toBe(8);

    const allergyResult =
      repository.persistRun.mock.calls[0][0].checkerResults.find(
        (entry: { checkerType: string }) =>
          entry.checkerType === 'drug_allergy',
      );
    expect(allergyResult.status).toBe('verified');
    expect(allergyResult.warnings).toHaveLength(1);
  });

  it('runs only drug-drug checking for a missed-dose trigger', async () => {
    const { service, drugDrug, drugAllergy, drugCondition, knowledgeStatus } =
      build();

    await service.route({ type: 'dose_missed', userMedicationId: 42 });

    expect(drugDrug.check).toHaveBeenCalled();
    expect(drugAllergy.check).not.toHaveBeenCalled();
    expect(drugCondition.check).not.toHaveBeenCalled();
    expect(knowledgeStatus.evaluate).not.toHaveBeenCalled();
  });

  it('keeps an unresolved manual precheck ephemeral and skips matching', async () => {
    const {
      service,
      drugDrug,
      drugAllergy,
      drugCondition,
      knowledgeStatus,
      repository,
    } = build();

    await expect(
      service.route({
        type: 'medication_precheck',
        draft: {
          userId: 1,
          medicationId: null,
          brandName: 'User-entered medicine',
          genericName: null,
          verificationSource: 'manual',
          verificationStatus: 'unresolved',
          dailyMedId: null,
        },
      }),
    ).resolves.toEqual({
      safe: true,
      outcome: 'clear',
      coverageStatus: 'complete',
      severity: 'clear',
      warnings: [],
      checkerResults: [],
    });

    expect(drugDrug.check).not.toHaveBeenCalled();
    expect(drugAllergy.check).not.toHaveBeenCalled();
    expect(drugCondition.check).not.toHaveBeenCalled();
    expect(knowledgeStatus.evaluate).not.toHaveBeenCalled();
    expect(repository.captureContext).not.toHaveBeenCalled();
    expect(repository.persistRun).not.toHaveBeenCalled();
  });

  it('runs all checkers for a verified precheck without persisting a run', async () => {
    const {
      service,
      drugDrug,
      drugAllergy,
      drugCondition,
      knowledgeStatus,
      repository,
    } = build();

    const result = await service.route({
      type: 'medication_precheck',
      draft: {
        userId: 1,
        medicationId: 7,
        brandName: 'Example',
        genericName: 'example',
        verificationSource: 'palestine_moh',
        verificationStatus: 'verified',
        dailyMedId: null,
      },
    });

    expect(result).not.toHaveProperty('runId');
    expect(drugDrug.check).toHaveBeenCalled();
    expect(drugAllergy.check).toHaveBeenCalled();
    expect(drugCondition.check).toHaveBeenCalled();
    expect(knowledgeStatus.evaluate).not.toHaveBeenCalled();
    expect(repository.captureContext).not.toHaveBeenCalled();
    expect(repository.persistRun).not.toHaveBeenCalled();
  });

  it('runs all checkers and persists an active review', async () => {
    const {
      service,
      drugDrug,
      drugAllergy,
      drugCondition,
      knowledgeStatus,
      repository,
    } = build();

    await service.route({ type: 'active_review', userMedicationId: 42 });

    expect(drugDrug.check).toHaveBeenCalled();
    expect(drugAllergy.check).toHaveBeenCalled();
    expect(drugCondition.check).toHaveBeenCalled();
    expect(knowledgeStatus.evaluate).not.toHaveBeenCalled();
    expect(repository.captureContext).toHaveBeenCalledWith(42);
    expect(repository.persistRun).toHaveBeenCalled();
  });

  it.each([
    'medication_archived',
    'allergy_updated',
    'condition_updated',
    'knowledge_updated',
    'label_updated',
    'manual_recheck',
  ] as const)('runs the full plan for a %s recheck', async (type) => {
    const { service, drugDrug, knowledgeStatus } = build();

    await service.route({ type, userMedicationId: 42 });

    expect(drugDrug.check).toHaveBeenCalled();
    expect(knowledgeStatus.evaluate).toHaveBeenCalledWith(42);
  });
});
