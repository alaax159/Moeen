import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { HealthProfileRepository } from '../database/repository/health-profile.repository';
import { MedicationSafetyModule } from '../medication-safety/medication-safety.module';
import { AllergiesAndChronicConditionsController } from './allergiesAndChronicConditions/allergiesAndChronicConditions.controller';
import { AllergiesAndChronicConditionsService } from './allergiesAndChronicConditions/allergiesAndChronicConditions.service';
import { MedicalTerminologyController } from './medical-terminology/medical-terminology.controller';
import { MedicalTerminologyService } from './medical-terminology/medical-terminology.service';
import { PersonalInfoController } from './personal-info/personal-info.controller';
import { PersonalInfoService } from './personal-info/personal-info.service';

@Module({
  imports: [HttpModule, MedicationSafetyModule],
  controllers: [
    PersonalInfoController,
    MedicalTerminologyController,
    AllergiesAndChronicConditionsController,
  ],
  providers: [
    PersonalInfoService,
    HealthProfileRepository,
    MedicalTerminologyService,
    AllergiesAndChronicConditionsService,
  ],
})
export class HealthProfileModule {}
