import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { UserMedicationRepository } from '../../database/repository/user-medication.repository';
import {
  MedicationSafetyChecker,
  MedicationSafetyEvent,
  MedicationSafetyWarning,
} from '../medication-safety.contracts';
import { RxNormUnavailableError } from '../rxnorm/rxnorm-unavailable.error';
import { RxNormService } from '../rxnorm/rxnorm.service';
import {
  DRUG_INTERACTION_PROVIDER,
  DrugInteractionProvider,
  NormalizedDrug,
} from './drug-interaction-provider';

type MedicationIdentity = {
  brandName: string | null;
  genericName: string | null;
  rxcui?: string | null;
};

@Injectable()
export class DrugDrugCheckerService implements MedicationSafetyChecker {
  private readonly logger = new Logger(DrugDrugCheckerService.name);

  constructor(
    private readonly userMedicationRepository: UserMedicationRepository,
    private readonly rxNormService: RxNormService,
    @Inject(DRUG_INTERACTION_PROVIDER)
    private readonly interactionProvider: DrugInteractionProvider,
  ) {}

  async check(
    event: MedicationSafetyEvent,
  ): Promise<MedicationSafetyWarning[]> {
    const targetMedication = event.draft
      ? {
          userId: event.draft.userId,
          genericName: event.draft.genericName,
          brandName: event.draft.brandName,
          rxcui: event.draft.rxcui,
        }
      : await this.userMedicationRepository.getMedicationSafetyContext(
          event.userMedicationId!,
        );

    if (!targetMedication) {
      throw new NotFoundException(
        `User medication ${event.userMedicationId} was not found`,
      );
    }

    const targetDrug = await this.normalizeMedication(targetMedication);

    if (!targetDrug) {
      return [
        this.unverifiedWarning(
          this.displayName(targetMedication),
          'target medication could not be normalized',
          this.subjectIds(event),
        ),
      ];
    }

    const activeMedications =
      await this.userMedicationRepository.getActiveMedicationsByUserId(
        targetMedication.userId,
      );

    const seenMedicationIds = new Set<number>();
    const warnings: MedicationSafetyWarning[] = [];

    for (const medication of activeMedications) {
      if (
        medication.id === event.userMedicationId ||
        seenMedicationIds.has(medication.medicationId)
      ) {
        continue;
      }

      seenMedicationIds.add(medication.medicationId);

      const otherDrug = await this.normalizeMedication(medication);

      if (!otherDrug) {
        warnings.push(
          this.unverifiedWarning(
            this.displayName(medication),
            `interaction with ${targetDrug.name} could not be verified`,
            this.subjectIds(event, medication.id),
          ),
        );
        continue;
      }

      const interaction = await this.interactionProvider.checkInteraction(
        targetDrug,
        otherDrug,
      );

      if (!interaction) {
        continue;
      }

      warnings.push({
        warningType: 'drug_drug',
        severity: interaction.severity,
        message:
          interaction.message ||
          `${targetDrug.name} may interact with ${otherDrug.name}.`,
        ...(event.userMedicationId === undefined
          ? {}
          : {
              subjectUserMedicationIds: [event.userMedicationId, medication.id],
            }),
      });
    }

    return warnings;
  }

  private async normalizeMedication(
    medication: MedicationIdentity,
  ): Promise<NormalizedDrug | null> {
    const suppliedRxcui = medication.rxcui?.trim();

    if (suppliedRxcui) {
      return {
        rxcui: suppliedRxcui,
        name: this.displayName(medication),
      };
    }

    try {
      const resolution = await this.rxNormService.resolveMedication(
        medication.genericName,
        medication.brandName,
      );

      if (resolution.status !== 'resolved') {
        this.logger.warn(
          `RxNorm did not resolve ${this.displayName(medication)}: status=${resolution.status}` +
            (resolution.status === 'ambiguous'
              ? ` rxcuis=${resolution.rxcuis.join(',')}`
              : ''),
        );
        return null;
      }

      return {
        rxcui: resolution.rxcui,
        name: resolution.inputName,
      };
    } catch (error) {
      if (error instanceof RxNormUnavailableError) {
        this.logger.warn(
          `RxNorm lookup failed for ${this.displayName(medication)}: ${error.message}`,
        );
        return null;
      }

      throw error;
    }
  }

  private displayName(medication: MedicationIdentity): string {
    return (
      medication.genericName ?? medication.brandName ?? 'unknown medication'
    );
  }

  /**
   * Attributes a warning to the medications it concerns. A medication_precheck
   * draft has no persisted row yet, so its id is simply absent rather than
   * defaulting to an unrelated medication.
   */
  private subjectIds(
    event: MedicationSafetyEvent,
    otherUserMedicationId?: number,
  ): number[] {
    return [
      ...(event.userMedicationId === undefined ? [] : [event.userMedicationId]),
      ...(otherUserMedicationId === undefined ? [] : [otherUserMedicationId]),
    ];
  }

  private unverifiedWarning(
    medicationName: string,
    reason: string,
    subjectUserMedicationIds: number[],
  ): MedicationSafetyWarning {
    return {
      warningType: 'drug_drug',
      severity: 'unknown',
      message: `Unable to verify drug-drug safety for ${medicationName}: ${reason}.`,
      subjectUserMedicationIds,
    };
  }
}
