import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { SafetyWarningRepository } from '../../database/repository/safety-warning.repository';
import type {
  MedicationSafetyChecker,
  MedicationSafetyEvent,
  MedicationSafetyWarning,
} from '../medication-safety.contracts';
import {
  DRUG_CONDITION_INTERACTION_PROVIDER,
  DrugConditionInteractionProvider,
} from '../providers/drug-condition-interaction.provider';
import { RxNormService } from '../rxnorm/rxnorm.service';
import { RxNormUnavailableError } from '../rxnorm/rxnorm-unavailable.error';

@Injectable()
export class DrugConditionChecker implements MedicationSafetyChecker {
  constructor(
    @Inject(DRUG_CONDITION_INTERACTION_PROVIDER)
    private readonly interactionProvider: DrugConditionInteractionProvider,
    private readonly safetyWarningRepository: SafetyWarningRepository,
    private readonly rxNormService: RxNormService,
  ) {}

  async check(
    event: MedicationSafetyEvent,
  ): Promise<MedicationSafetyWarning[]> {
    const medicationContext = event.draft
      ? {
          userId: event.draft.userId,
          genericName: event.draft.genericName,
          brandName: event.draft.brandName,
        }
      : await this.safetyWarningRepository.getMedicationContext(
          event.userMedicationId!,
        );

    if (!medicationContext) {
      throw new NotFoundException('User medication not found');
    }

    const activeConditions =
      await this.safetyWarningRepository.getActiveChronicConditions(
        medicationContext.userId,
      );
    const medicationName =
      medicationContext.genericName ?? medicationContext.brandName;

    if (!medicationName) {
      throw new UnprocessableEntityException('medication name is unavailable');
    }

    if (activeConditions.length === 0) {
      return [];
    }

    let rxcui = event.draft?.rxcui?.trim() || undefined;

    if (!rxcui) {
      try {
        const resolution = await this.rxNormService.resolveMedication(
          medicationContext.genericName,
          medicationContext.brandName,
        );

        if (resolution.status === 'resolved') {
          rxcui = resolution.rxcui;
        }
      } catch (error: unknown) {
        if (!(error instanceof RxNormUnavailableError)) {
          throw error;
        }
      }
    }

    const interactions = await Promise.all(
      activeConditions.map(async (condition) => ({
        condition,
        interaction: await this.interactionProvider.checkInteraction({
          medicationName,
          rxcui,
          conditionName: condition.name,
        }),
      })),
    );

    return interactions
      .filter(({ interaction }) => interaction.interacts !== false)
      .map(({ interaction, condition }) => ({
        warningType: 'drug_condition',
        severity: interaction.severity,
        message: interaction.message,
        affected: condition.name,
        ...(event.userMedicationId === undefined
          ? {}
          : { subjectUserMedicationIds: [event.userMedicationId] }),
        subjectUserConditionId: condition.id,
        evidence: [
          {
            source: interaction.source,
            sourceRecordId: condition.externalId ?? String(condition.id),
            retrievedAt: new Date(),
          },
        ],
      }));
  }
}
