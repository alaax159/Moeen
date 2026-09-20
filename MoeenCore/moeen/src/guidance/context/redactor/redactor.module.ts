import { Module } from '@nestjs/common';
import { Redactor } from './redactor.service';
import { REDACTOR_PORT } from './redactor.port';

@Module({
  providers: [{ provide: REDACTOR_PORT, useClass: Redactor }],
  exports: [REDACTOR_PORT],
})
export class RedactorModule {}
