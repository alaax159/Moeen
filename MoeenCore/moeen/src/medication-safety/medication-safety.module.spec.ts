import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DrugAllergyCheckerService } from './drug-allergy/drug-allergy-checker.service';

import { DrugConditionChecker } from './checkers/drug-condition.checker';
import { DdinterCsvProvider } from './drug-drug/ddinter-csv.provider';
import { DrugDrugCheckerService } from './drug-drug/drug-drug-checker.service';
import { DRUG_INTERACTION_PROVIDER } from './drug-drug/drug-interaction-provider';
import {
  DRUG_ALLERGY_CHECKER,
  DRUG_CONDITION_CHECKER,
  DRUG_DRUG_CHECKER,
} from './medication-safety.contracts';
import { MedicationSafetyModule } from './medication-safety.module';
import { MedicationSafetyRouterService } from './medication-safety-router.service';
import { DRUG_CONDITION_INTERACTION_PROVIDER } from './providers/drug-condition-interaction.provider';
import { PreferredDrugConditionProvider } from './providers/preferred-drug-condition.provider';

describe('MedicationSafetyModule', () => {
  it('wires the drug-drug checker to the DDInter provider', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        MedicationSafetyModule,
      ],
    }).compile();

    expect(moduleRef.get(DrugDrugCheckerService)).toBeInstanceOf(
      DrugDrugCheckerService,
    );

    expect(moduleRef.get(DRUG_INTERACTION_PROVIDER)).toBeInstanceOf(
      DdinterCsvProvider,
    );

    expect(moduleRef.get(DRUG_DRUG_CHECKER)).toBe(
      moduleRef.get(DrugDrugCheckerService),
    );

    expect(moduleRef.get(DRUG_CONDITION_INTERACTION_PROVIDER)).toBeInstanceOf(
      PreferredDrugConditionProvider,
    );

    expect(moduleRef.get(DRUG_CONDITION_CHECKER)).toBe(
      moduleRef.get(DrugConditionChecker),
    );

    expect(moduleRef.get(DRUG_ALLERGY_CHECKER)).toBeInstanceOf(
      DrugAllergyCheckerService,
    );

    expect(moduleRef.get(MedicationSafetyRouterService)).toBeInstanceOf(
      MedicationSafetyRouterService,
    );

    await moduleRef.close();
  });
});
