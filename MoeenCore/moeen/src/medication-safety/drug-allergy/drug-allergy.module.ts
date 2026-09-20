import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '../../database/database.module';
import { HealthProfileRepository } from '../../database/repository/health-profile.repository';
import { DRUG_ALLERGY_CHECKER } from '../medication-safety.contracts';
import { DailyMedIngredientService } from './dailymed-ingredient.service';
import { DrugAllergyCheckerService } from './drug-allergy-checker.service';
import { DrugAllergyContextProviderService } from './drug-allergy-context.provider';
import { DRUG_ALLERGY_CONTEXT_PROVIDER } from './drug-allergy.tokens';
import { RxNormSubstanceResolverService } from './rxnorm-substance-resolver.service';
import { SnomedAllergyResolverService } from './snomed-allergy-resolver.service';

@Module({
  imports: [DatabaseModule, HttpModule, ConfigModule],
  providers: [
    HealthProfileRepository,

    DailyMedIngredientService,
    SnomedAllergyResolverService,
    RxNormSubstanceResolverService,

    DrugAllergyContextProviderService,
    DrugAllergyCheckerService,

    {
      provide: DRUG_ALLERGY_CONTEXT_PROVIDER,
      useExisting: DrugAllergyContextProviderService,
    },
    {
      provide: DRUG_ALLERGY_CHECKER,
      useExisting: DrugAllergyCheckerService,
    },
  ],
  exports: [DRUG_ALLERGY_CHECKER],
})
export class DrugAllergyModule {}
