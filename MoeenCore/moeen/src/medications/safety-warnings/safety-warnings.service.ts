import { Injectable, Logger } from '@nestjs/common';

import { SafetyWarningRepository } from '../../database/repository/safety-warning.repository';
import { UserMedicationRepository } from '../../database/repository/user-medication.repository';
import { KnowledgeStatusService } from '../../medication-safety/knowledge-status/knowledge-status.service';
import { MedicationSafetyRouterService } from '../../medication-safety/medication-safety-router.service';

const RESPONSE_WARNING_TYPES = ['drug_allergy', 'drug_condition'] as const;
type ResponseWarningType = (typeof RESPONSE_WARNING_TYPES)[number];

type UnverifiedArea = 'allergy' | 'condition';
type CheckOutcome = 'checked' | 'failed';

type ActiveMedication = Awaited<
  ReturnType<UserMedicationRepository['getActiveMedicationsByUserId']>
>[number];
type PersistedWarning = Awaited<
  ReturnType<SafetyWarningRepository['findActiveWarningsForUser']>
>[number];
type CheckStatus = Awaited<
  ReturnType<SafetyWarningRepository['findCheckStatusesForUser']>
>[number];
type KnowledgeStatus = Awaited<
  ReturnType<KnowledgeStatusService['evaluate']>
>;

export type SafetyWarningItem = {
  warningType: ResponseWarningType;
  severity: string;
  message: string;
};

export type MedicationSafetyWarnings = {
  userMedicationId: number;
  medicationId: number;
  brandName: string | null;
  genericName: string | null;
  status: CheckOutcome;
  lastCheckedAt: string | null;
  unverified: UnverifiedArea[];
  warnings: SafetyWarningItem[];
};

export type SafetyWarningsResponse = { medications: MedicationSafetyWarnings[] };

@Injectable()
export class SafetyWarningsService {
  private readonly logger = new Logger(SafetyWarningsService.name);

  constructor(
    private readonly safetyWarningRepository: SafetyWarningRepository,
    private readonly userMedicationRepository: UserMedicationRepository,
    private readonly medicationSafetyRouter: MedicationSafetyRouterService,
    private readonly knowledgeStatusService: KnowledgeStatusService,
  ) {}

  async getSafetyWarnings(firebaseUid: string): Promise<SafetyWarningsResponse> {
    const userId =
      await this.userMedicationRepository.getUserIdByFirebaseUid(firebaseUid);

    if (userId === undefined) {
      return { medications: [] };
    }

    const [activeMedications, persistedWarnings, checkStatuses] =
      await Promise.all([
        this.userMedicationRepository.getActiveMedicationsByUserId(userId),
        this.safetyWarningRepository.findActiveWarningsForUser(userId),
        this.safetyWarningRepository.findCheckStatusesForUser(userId),
      ]);

    if (activeMedications.length === 0) {
      return { medications: [] };
    }

    // allergy/condition knowledge status lives on the user's health profile, so
    // it is the same for every one of their medications — evaluate once.
    const knowledge = await this.knowledgeStatusService.evaluate(
      activeMedications[0].id,
    );
    const unverified: UnverifiedArea[] = [
      ...(knowledge.checkAllergies ? [] : (['allergy'] as const)),
      ...(knowledge.checkConditions ? [] : (['condition'] as const)),
    ];

    const warningsByMedication = new Map<number, PersistedWarning[]>();
    for (const warning of persistedWarnings) {
      const list = warningsByMedication.get(warning.userMedicationId) ?? [];
      list.push(warning);
      warningsByMedication.set(warning.userMedicationId, list);
    }

    const statusByMedication = new Map<number, CheckStatus>();
    for (const status of checkStatuses) {
      statusByMedication.set(status.userMedicationId, status);
    }

    const medications = await Promise.all(
      activeMedications.map((medication) =>
        this.resolveMedication(
          medication,
          warningsByMedication.get(medication.id) ?? [],
          statusByMedication.get(medication.id),
          knowledge,
          unverified,
        ),
      ),
    );

    return { medications };
  }

  private async resolveMedication(
    medication: ActiveMedication,
    persistedWarnings: PersistedWarning[],
    checkStatus: CheckStatus | undefined,
    knowledge: KnowledgeStatus,
    unverified: UnverifiedArea[],
  ): Promise<MedicationSafetyWarnings> {
    const base = {
      userMedicationId: medication.id,
      medicationId: medication.medicationId,
      brandName: medication.brandName,
      genericName: medication.genericName,
      unverified,
    };

    const shouldRecompute =
      checkStatus?.status === 'failed' ||
      (checkStatus === undefined && persistedWarnings.length === 0);

    if (!shouldRecompute) {
      return {
        ...base,
        status: checkStatus?.status ?? 'checked',
        lastCheckedAt: this.readLastCheckedAt(checkStatus, persistedWarnings),
        warnings: this.toResponseWarnings(persistedWarnings),
      };
    }

    try {
      const result = await this.medicationSafetyRouter.route({
        type: 'medication_updated',
        userMedicationId: medication.id,
      });

      // A knowledge-status "information is missing" notice is emitted for a
      // warning type only when its checker did NOT run — keep as a finding only
      // the warnings whose checker actually ran. The missing coverage is
      // reported through `unverified`, not mixed into `warnings`.
      const findings = result.warnings.filter(
        (warning) =>
          warning.warningType === 'drug_drug' ||
          (warning.warningType === 'drug_allergy' &&
            knowledge.checkAllergies) ||
          (warning.warningType === 'drug_condition' &&
            knowledge.checkConditions),
      );

      await this.safetyWarningRepository.replaceActiveWarnings(
        medication.id,
        findings,
      );

      return {
        ...base,
        status: 'checked',
        lastCheckedAt: new Date().toISOString(),
        warnings: this.toResponseWarnings(findings),
      };
    } catch (error) {
      this.logger.error(
        `Live safety recompute failed for userMedicationId=${medication.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.safetyWarningRepository.recordFailedCheck(medication.id);
      return {
        ...base,
        status: 'failed',
        lastCheckedAt: checkStatus?.checkedAt
          ? checkStatus.checkedAt.toISOString()
          : null,
        warnings: this.toResponseWarnings(persistedWarnings),
      };
    }
  }

  private readLastCheckedAt(
    checkStatus: CheckStatus | undefined,
    persistedWarnings: PersistedWarning[],
  ): string | null {
    if (checkStatus?.checkedAt) {
      return checkStatus.checkedAt.toISOString();
    }
    if (persistedWarnings.length === 0) {
      return null;
    }
    const latest = persistedWarnings.reduce<Date>(
      (max, warning) => (warning.checkedAt > max ? warning.checkedAt : max),
      persistedWarnings[0].checkedAt,
    );
    return latest.toISOString();
  }

  private toResponseWarnings(
    warnings: { warningType: string; severity: string; message: string }[],
  ): SafetyWarningItem[] {
    return warnings
      .filter((warning): warning is SafetyWarningItem =>
        (RESPONSE_WARNING_TYPES as readonly string[]).includes(
          warning.warningType,
        ),
      )
      .map((warning) => ({
        warningType: warning.warningType,
        severity: warning.severity,
        message: warning.message,
      }));
  }
}
