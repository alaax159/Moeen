import {
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  MedicationSafetyChecker,
  MedicationSafetyEvent,
  MedicationSafetyFindingSeverity,
  MedicationSafetyWarning,
} from '../medication-safety.contracts';

import { DRUG_ALLERGY_CONTEXT_PROVIDER } from './drug-allergy.tokens';
import type { DrugAllergyContextProvider } from './drug-allergy.types';

/**
 * Severity applied to a confirmed ingredient-to-allergy match whose recorded
 * severity is missing or not one we recognise. user_allergies.severity is
 * free-text and nullable, so this is a routine case, not an edge case.
 *
 * It must stay a real finding severity: 'unknown' means "we could not check"
 * to the router, which drops those warnings from the result entirely. A match
 * we did confirm must never be reported as a coverage gap.
 */
const UNGRADED_MATCH_SEVERITY: MedicationSafetyFindingSeverity = 'moderate';

@Injectable()
export class DrugAllergyCheckerService implements MedicationSafetyChecker {
  private readonly logger = new Logger(DrugAllergyCheckerService.name);

  constructor(
    @Inject(DRUG_ALLERGY_CONTEXT_PROVIDER)
    private readonly contextProvider: DrugAllergyContextProvider,
  ) {}

  async check(
    event: MedicationSafetyEvent,
  ): Promise<MedicationSafetyWarning[]> {
    if (event.draft) {
      if (event.draft.medicationId) {
        return this.checkWithContext({
          userId: event.draft.userId,
          medicationId: event.draft.medicationId,
        });
      }

      if (event.draft.dailyMedId) {
        return this.checkWithContext({
          userId: event.draft.userId,
          dailyMedId: event.draft.dailyMedId,
        });
      }

      return [];
    }

    const context = await this.contextProvider.getUserMedicationContext(
      event.userMedicationId!,
    );

    return this.checkWithContext({
      userId: context.userId,
      medicationId: context.medicationId,
      userMedicationId: event.userMedicationId,
    });
  }

  private async checkWithContext(context: {
    userId: number;
    medicationId?: number;
    dailyMedId?: string;
    userMedicationId?: number;
  }): Promise<MedicationSafetyWarning[]> {
    const allergies = await this.contextProvider.getActiveAllergies(
      context.userId,
    );
    if (!allergies.length) {
      return [];
    }

    let medicationAllergens;

    try {
      if (context.medicationId !== undefined) {
        medicationAllergens = await this.contextProvider.getMedicationAllergens(
          context.medicationId,
        );
      } else if (context.dailyMedId) {
        medicationAllergens =
          await this.contextProvider.getMedicationAllergensByDailyMedId(
            context.dailyMedId,
          );
      } else {
        return [];
      }
    } catch (error: unknown) {
      if (
        context.medicationId !== undefined &&
        error instanceof UnprocessableEntityException
      ) {
        this.logger.warn(
          `Skipping allergy check for medication ${context.medicationId}: ${error.message}`,
        );
        return [
          this.unverifiedWarning(
            context.userMedicationId,
            'medication ingredient data is unavailable',
          ),
        ];
      }

      throw error;
    }

    if (!medicationAllergens.length) {
      return [
        this.unverifiedWarning(
          context.userMedicationId,
          'the medication label contains no verifiable ingredient data',
        ),
      ];
    }

    const warnings: MedicationSafetyWarning[] = [];
    const seen = new Set<string>();

    for (const allergy of allergies) {
      const matchIdentifiers =
        await this.contextProvider.getAllergyMatchIdentifiers(allergy);

      if (!matchIdentifiers.length) {
        warnings.push(
          this.unverifiedWarning(
            context.userMedicationId,
            `allergy ${allergy.id} could not be resolved`,
            allergy.id,
          ),
        );
        continue;
      }

      const matchIdentifierSet = new Set(matchIdentifiers);

      for (const ingredient of medicationAllergens) {
        if (!matchIdentifierSet.has(ingredient.identifier)) {
          continue;
        }

        const key = `${allergy.id}:${ingredient.identifier}`;

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);

        const recordedSeverity = this.normalizeSeverity(allergy.severity);

        warnings.push({
          warningType: 'drug_allergy',
          severity: recordedSeverity ?? UNGRADED_MATCH_SEVERITY,
          message:
            `Medication ingredient ${ingredient.name} ` +
            `matches the recorded allergy ${allergy.name}.` +
            (recordedSeverity
              ? ''
              : ' The recorded allergy severity is unspecified, so this match' +
                ' has not been graded from the patient record.'),
          affected: allergy.name,
          ...(context.userMedicationId === undefined
            ? {}
            : { subjectUserMedicationIds: [context.userMedicationId] }),
          subjectUserAllergyId: allergy.id,
          evidence: [
            {
              source: 'dailymed',
              sourceRecordId: ingredient.identifier,
              details: { ingredientType: ingredient.source },
              retrievedAt: new Date(),
            },
          ],
        });
      }
    }

    return warnings;
  }

  /**
   * Maps the patient's free-text recorded severity onto the finding scale.
   * Returns null when nothing recognisable was recorded, so the caller can
   * tell "graded by the patient record" apart from "ungraded".
   */
  private normalizeSeverity(
    severity: string | null,
  ): MedicationSafetyFindingSeverity | null {
    switch (severity?.trim().toLowerCase()) {
      case 'low':
      case 'mild':
      case 'minor':
        return 'minor';
      case 'medium':
      case 'moderate':
        return 'moderate';
      case 'high':
      case 'severe':
      case 'major':
        return 'major';
      case 'contraindicated':
        return 'contraindicated';
      default:
        return null;
    }
  }

  private unverifiedWarning(
    userMedicationId: number | undefined,
    reason: string,
    userAllergyId?: number,
  ): MedicationSafetyWarning {
    return {
      warningType: 'drug_allergy',
      severity: 'unknown',
      message: `Unable to verify drug-allergy safety because ${reason}.`,
      ...(userMedicationId === undefined
        ? {}
        : { subjectUserMedicationIds: [userMedicationId] }),
      ...(userAllergyId === undefined
        ? {}
        : { subjectUserAllergyId: userAllergyId }),
    };
  }
}
