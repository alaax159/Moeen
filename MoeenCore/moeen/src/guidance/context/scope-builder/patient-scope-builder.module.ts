import { Module } from '@nestjs/common';

import { SafetyResultAdapterModule } from '../../adapters/safety-result-adapter/safety-result-adapter.module';
import { PatientScopeBuilder } from './patient-scope-builder.service';
import { PATIENT_SCOPE_BUILDER_PORT } from './patient-scope-builder.port';

@Module({
  imports: [SafetyResultAdapterModule],
  providers: [
    { provide: PATIENT_SCOPE_BUILDER_PORT, useClass: PatientScopeBuilder },
  ],
  exports: [PATIENT_SCOPE_BUILDER_PORT],
})
export class PatientScopeBuilderModule {}
