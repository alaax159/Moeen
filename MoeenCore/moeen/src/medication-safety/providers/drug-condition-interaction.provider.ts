import type { MedicationSafetyFindingSeverity } from '../medication-safety.contracts';

export type DrugConditionInput = {
  medicationName: string;
  rxcui?: string;
  conditionName: string;
};

export type DrugConditionInteraction =
  | {
      interacts: true;
      severity: MedicationSafetyFindingSeverity;
      message: string;
      source: string;
    }
  | {
      interacts: null;
      severity: 'unknown';
      message: string;
      source: string;
    }
  | {
      interacts: false;
      severity: 'none';
      message: string;
      source: string;
    };

export const DRUG_CONDITION_INTERACTION_PROVIDER = Symbol(
  'DRUG_CONDITION_INTERACTION_PROVIDER',
);

export interface DrugConditionInteractionProvider {
  checkInteraction(
    input: DrugConditionInput,
  ): Promise<DrugConditionInteraction>;
}

// Optional capability: the current DDInter CSV adapter has only drug pairs.
// Never pass a disease to its Drug–Drug checkInteraction method.
export interface DrugDiseaseCapability {
  checkDrugDiseaseInteraction?(
    input: DrugConditionInput,
  ): Promise<DrugConditionInteraction | null>;
}
