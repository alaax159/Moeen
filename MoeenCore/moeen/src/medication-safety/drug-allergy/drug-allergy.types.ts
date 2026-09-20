export type AllergyRecord = {
  id: number;
  name: string;
  severity: string | null;
  externalId: string | null;
};

export type MedicationAllergen = {
  identifier: string;
  name: string;
  source: 'drug_ingredient' | 'excipient';
};

export type UserMedicationSafetyContext = {
  userId: number;
  medicationId: number;
};

export interface DrugAllergyContextProvider {
  getUserMedicationContext(
    userMedicationId: number,
  ): Promise<UserMedicationSafetyContext>;

  getActiveAllergies(userId: number): Promise<AllergyRecord[]>;

  getMedicationAllergens(medicationId: number): Promise<MedicationAllergen[]>;

  getMedicationAllergensByDailyMedId(
    dailyMedId: string,
  ): Promise<MedicationAllergen[]>;

  getAllergyMatchIdentifiers(allergy: AllergyRecord): Promise<string[]>;
}
