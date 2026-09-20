import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { SafetyWarningRepository } from '../database/repository/safety-warning.repository';
import { UsersModule } from '../users/users.module';
import { ActiveInteractionsController } from './active-interactions.controller';
import { ActiveInteractionsService } from './active-interactions.service';
import { DrugConditionChecker } from './checkers/drug-condition.checker';
import { CURRENT_MEDICATION_RECHECK_QUEUE } from './current-medication-recheck-queue/current-medication-recheck-queue.constants';
import { CurrentMedicationRecheckProcessor } from './current-medication-recheck-queue/current-medication-recheck.processor';
import { CurrentMedicationRecheckQueue } from './current-medication-recheck-queue/current-medication-recheck.queue';
import { CurrentMedicationRecheckService } from './current-medication-recheck.service';
import { DrugAllergyModule } from './drug-allergy/drug-allergy.module';
import { DdinterCsvProvider } from './drug-drug/ddinter-csv.provider';
import { DrugDrugCheckerService } from './drug-drug/drug-drug-checker.service';
import { DRUG_INTERACTION_PROVIDER } from './drug-drug/drug-interaction-provider';
import { KnowledgeStatusService } from './knowledge-status/knowledge-status.service';
import { MedicationSafetyEventsService } from './medication-safety-events.service';
import { MedicationSafetyRouterService } from './medication-safety-router.service';
import { MedicationSafetyTriggerRouterListener } from './medication-safety-trigger-router.listener';
import {
  DRUG_CONDITION_CHECKER,
  DRUG_DRUG_CHECKER,
} from './medication-safety.contracts';
import { DRUG_CONDITION_INTERACTION_PROVIDER } from './providers/drug-condition-interaction.provider';
import { PreferredDrugConditionProvider } from './providers/preferred-drug-condition.provider';
import { OpenFdaDrugConditionProvider } from './providers/openfda-drug-condition.provider';
import { MedicationSafetyRunRepository } from './persistence/medication-safety-run.repository';
import { RxNormModule } from './rxnorm/rxnorm.module';
import { MedicationSafetyRecheckOutboxRepository } from './invalidation/medication-safety-recheck-outbox.repository';
import { MedicationSafetyRecheckProcessor } from './invalidation/medication-safety-recheck.processor';
import { EmergencySupportModule } from '../emergency-support/emergency-support.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    HttpModule,
    RxNormModule,
    DatabaseModule,
    DrugAllergyModule,
    EmergencySupportModule,
    BullModule.registerQueue({
      name: CURRENT_MEDICATION_RECHECK_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    }),
  ],
  controllers: [ActiveInteractionsController],
  providers: [
    ActiveInteractionsService,
    MedicationSafetyEventsService,
    MedicationSafetyRouterService,
    MedicationSafetyRunRepository,
    MedicationSafetyTriggerRouterListener,
    CurrentMedicationRecheckService,
    CurrentMedicationRecheckQueue,
    CurrentMedicationRecheckProcessor,
    DdinterCsvProvider,
    DrugDrugCheckerService,
    SafetyWarningRepository,
    DrugConditionChecker,
    OpenFdaDrugConditionProvider,
    PreferredDrugConditionProvider,
    KnowledgeStatusService,
    MedicationSafetyRecheckOutboxRepository,
    MedicationSafetyRecheckProcessor,
    {
      provide: DRUG_DRUG_CHECKER,
      useExisting: DrugDrugCheckerService,
    },
    {
      provide: DRUG_INTERACTION_PROVIDER,
      useExisting: DdinterCsvProvider,
    },
    {
      provide: DRUG_CONDITION_INTERACTION_PROVIDER,
      useExisting: PreferredDrugConditionProvider,
    },
    {
      provide: DRUG_CONDITION_CHECKER,
      useExisting: DrugConditionChecker,
    },
  ],
  exports: [
    RxNormModule,
    MedicationSafetyEventsService,
    MedicationSafetyRouterService,
    CurrentMedicationRecheckService,
    CurrentMedicationRecheckQueue,
    DrugDrugCheckerService,
    DrugConditionChecker,
    DRUG_DRUG_CHECKER,
    DRUG_CONDITION_CHECKER,
    KnowledgeStatusService,
    SafetyWarningRepository,
  ],
})
export class MedicationSafetyModule {}
