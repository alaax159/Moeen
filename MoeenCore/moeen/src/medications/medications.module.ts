import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { MedicationSafetyModule } from '../medication-safety/medication-safety.module';
import { DatabaseRepository } from '../database/repository/database.repository';
import { AddMedicationController } from './add-medication/add-medication.controller';
import { AddMedicationService } from './add-medication/add-medication.service';
import { MedicationsController as ArchiveMedicationController } from './archive-medication/archive-medication.controller';
import { ArchiveMedicationService } from './archive-medication/archive-medication.service';
import { GetMedicationInfoController } from './get-medication-info/get-medication-info.controller';
import { GetMedicationInfoService } from './get-medication-info/get-medication-info.service';
import { DosesController } from './list-medication/doses.controller';
import { GuidanceMessageRepository } from './list-medication/guidance-message.repository';
import { MedicationsController as ListMedicationController } from './list-medication/list-medication.controller';
import { ListMedicationService } from './list-medication/list-medication.service';
import { MedicationsController as SearchMedicationController } from './search-medication/search-medication.controller';
import { MedicationsService as SearchMedicationService } from './search-medication/search-medication.service';
import { UpdateMedicationController } from './update-medication/update-medication.controller';
import { UpdateMedicationService } from './update-medication/update-medication.service';
import { SafetyWarningsController } from './safety-warnings/safety-warnings.controller';
import { SafetyWarningsService } from './safety-warnings/safety-warnings.service';
import { DoseNotificationQueueModule } from '../notifications/dose-notification-queue/dose-notification-queue.module';

@Module({
  imports: [HttpModule, DoseNotificationQueueModule, MedicationSafetyModule],
  controllers: [
    AddMedicationController,
    ArchiveMedicationController,
    GetMedicationInfoController,
    ListMedicationController,
    DosesController,
    SearchMedicationController,
    UpdateMedicationController,
    SafetyWarningsController,
  ],
  providers: [
    DatabaseRepository,
    AddMedicationService,
    ArchiveMedicationService,
    GetMedicationInfoService,
    ListMedicationService,
    GuidanceMessageRepository,
    SearchMedicationService,
    UpdateMedicationService,
    SafetyWarningsService,
  ],
  // Reused by PrescriptionsModule so prescription confirmation adds
  // medications through exactly the same flow as a manual add.
  exports: [AddMedicationService],
})
export class MedicationsModule {}
