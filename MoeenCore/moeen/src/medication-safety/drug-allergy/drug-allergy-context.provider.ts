import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { HealthProfileRepository } from '../../database/repository/health-profile.repository';
import { MedicationRepository } from '../../database/repository/medication.repository';
import { UserMedicationRepository } from '../../database/repository/user-medication.repository';
import { DailyMedIngredientService } from './dailymed-ingredient.service';
import type {
  AllergyRecord,
  DrugAllergyContextProvider,
} from './drug-allergy.types';
import { RxNormSubstanceResolverService } from './rxnorm-substance-resolver.service';
import { SnomedAllergyResolverService } from './snomed-allergy-resolver.service';

@Injectable()
export class DrugAllergyContextProviderService implements DrugAllergyContextProvider {
  constructor(
    private readonly healthProfileRepository: HealthProfileRepository,
    private readonly userMedicationRepository: UserMedicationRepository,
    private readonly medicationRepository: MedicationRepository,
    private readonly dailyMedIngredientService: DailyMedIngredientService,
    private readonly snomedAllergyResolverService: SnomedAllergyResolverService,
    private readonly rxNormSubstanceResolverService: RxNormSubstanceResolverService,
  ) {}

  async getUserMedicationContext(userMedicationId: number) {
    const context =
      await this.userMedicationRepository.getSafetyContext(userMedicationId);

    if (!context) {
      throw new NotFoundException(
        `User medication ${userMedicationId} was not found`,
      );
    }

    return context;
  }

  getActiveAllergies(userId: number) {
    return this.healthProfileRepository.getActiveAllergiesByUserId(userId);
  }

  getMedicationForSafetyCheck(medicationId: number) {
    return this.medicationRepository.getForSafetyCheck(medicationId);
  }

  async getMedicationAllergens(medicationId: number) {
    const medication =
      await this.medicationRepository.getForSafetyCheck(medicationId);

    if (!medication) {
      throw new NotFoundException(`Medication ${medicationId} was not found`);
    }

    if (!medication.dailyMedId) {
      throw new UnprocessableEntityException(
        `Medication ${medicationId} does not have a DailyMed identifier`,
      );
    }

    return this.dailyMedIngredientService.getMedicationAllergens(
      medication.dailyMedId,
    );
  }

  getMedicationAllergensByDailyMedId(dailyMedId: string) {
    return this.dailyMedIngredientService.getMedicationAllergens(dailyMedId);
  }

  async getAllergyMatchIdentifiers(allergy: AllergyRecord): Promise<string[]> {
    if (!allergy.externalId) {
      return [];
    }

    const externalId = allergy.externalId.trim();

    const rxnormMatch = externalId.match(/^rxnorm:(\d+)$/i);

    if (rxnormMatch?.[1]) {
      return this.rxNormSubstanceResolverService.getUniiIdentifiersForRxcui(
        rxnormMatch[1],
      );
    }

    const match = externalId.match(/^(?:snomed:)?(\d+)$/i);

    if (!match?.[1]) {
      return [];
    }

    const snomedId = match[1];

    const causativeAgents =
      await this.snomedAllergyResolverService.getCausativeAgents(snomedId);

    const identifierGroups = await Promise.all(
      causativeAgents.map((agent) =>
        this.rxNormSubstanceResolverService.getUniiIdentifiersForSnomed(
          agent.snomedId,
        ),
      ),
    );

    return Array.from(new Set(identifierGroups.flat()));
  }
}
