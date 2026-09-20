import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../database/database.module';
import { SafetyResultAdapter } from './safety-result-adapter.service';
import { SafetyEngineRepository } from './safety-engine.repository';
import { SAFETY_RESULT_PORT } from './safety-result-adapter.port';

@Module({
  imports: [DatabaseModule],
  providers: [
    SafetyEngineRepository,
    { provide: SAFETY_RESULT_PORT, useClass: SafetyResultAdapter },
  ],
  exports: [SAFETY_RESULT_PORT],
})
export class SafetyResultAdapterModule {}
