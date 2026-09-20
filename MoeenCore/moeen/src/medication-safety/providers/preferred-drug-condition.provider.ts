import { Inject, Injectable } from '@nestjs/common';
import {
  DRUG_INTERACTION_PROVIDER,
  DrugInteractionProvider,
} from '../drug-drug/drug-interaction-provider';
import {
  DrugConditionInput,
  DrugConditionInteraction,
  DrugConditionInteractionProvider,
  DrugDiseaseCapability,
} from './drug-condition-interaction.provider';
import { OpenFdaDrugConditionProvider } from './openfda-drug-condition.provider';

@Injectable()
export class PreferredDrugConditionProvider implements DrugConditionInteractionProvider {
  constructor(
    @Inject(DRUG_INTERACTION_PROVIDER)
    private readonly ddinter: DrugInteractionProvider & DrugDiseaseCapability,
    private readonly openFda: OpenFdaDrugConditionProvider,
  ) {}

  async checkInteraction(
    input: DrugConditionInput,
  ): Promise<DrugConditionInteraction> {
    try {
      const result = await this.ddinter.checkDrugDiseaseInteraction?.(input);
      if (
        result?.interacts === true &&
        ['minor', 'moderate', 'major', 'contraindicated'].includes(
          result.severity,
        ) &&
        result.message.trim()
      ) {
        return result;
      }
    } catch {
      // An unavailable optional source must not prevent label verification.
    }
    return this.openFda.checkInteraction(input);
  }
}
