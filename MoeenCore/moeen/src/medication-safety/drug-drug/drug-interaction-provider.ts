export type NormalizedDrug = {
  rxcui: string;
  name: string;
};

export type DrugInteraction = {
  severity: string;
  message: string;
};

export interface DrugInteractionProvider {
  checkInteraction(
    drugA: NormalizedDrug,
    drugB: NormalizedDrug,
  ): Promise<DrugInteraction | null>;
}

export const DRUG_INTERACTION_PROVIDER = Symbol('DRUG_INTERACTION_PROVIDER');
